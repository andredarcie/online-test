// Cylinder Duel — servidor único:
//  1) serve os arquivos estáticos de /public (o jogo)
//  2) faz o relay em tempo real entre TODOS os jogadores via WebSocket
//
// Servidor fixo: todo mundo que entra cai na MESMA arena, sem limite de jogadores
// (modo todos-contra-todos). Roda em qualquer host Node persistente.
// Porta vem de process.env.PORT (Render/Fly) ou 3000 no local.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

// ---------- Servidor HTTP estático ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = normalize(join(PUBLIC, urlPath));
    if (!filePath.startsWith(PUBLIC)) { res.writeHead(403).end('Forbidden'); return; }
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
});

// ---------- Servidor WebSocket (arena única) ----------
const wss = new WebSocketServer({ server });

const MAX_HP = 100;
const DAMAGE = 25; // 4 acertos = abate
// cores distintas para diferenciar os jogadores (cicla se passar de 8)
const PALETTE = [0xe23344, 0x2255dd, 0x16a34a, 0xf59e0b, 0x9333ea, 0x0891b2, 0xdb2777, 0x111111];

const players = new Map(); // id -> player (TODOS no mesmo servidor)
let nextId = 1;
let colorIdx = 0;

function summary(p) {
  return { id: p.id, color: p.color, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, score: p.score, name: p.name };
}
function randomSpawn() {
  const a = Math.random() * Math.PI * 2;
  const r = 12 + Math.random() * 22;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: Math.random() * Math.PI * 2 };
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let me = null;

  const sendTo = (target, obj) => { if (target.readyState === target.OPEN) target.send(JSON.stringify(obj)); };
  // transmite para todos (opcionalmente incluindo o próprio remetente)
  const broadcast = (obj, includeSelf = false) => {
    const data = JSON.stringify(obj);
    for (const p of players.values()) {
      if (!includeSelf && p === me) continue;
      if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
    }
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ---- ping (eco imediato p/ medir latência) ----
    if (msg.type === 'ping') { sendTo(ws, { type: 'pong', t: msg.t }); return; }

    // ---- entrar na arena (sem sala, sem limite) ----
    if (msg.type === 'join') {
      if (me) return;
      const sp = randomSpawn();
      me = {
        id: 'p' + (nextId++),
        ws,
        color: PALETTE[colorIdx++ % PALETTE.length],
        x: sp.x, y: 1.7, z: sp.z, yaw: sp.yaw,
        hp: MAX_HP, score: 0,
        name: String(msg.name || 'Jogador').slice(0, 16),
      };
      players.set(me.id, me);

      // estado inicial com TODOS os jogadores já presentes
      const others = [...players.values()].filter((p) => p !== me).map(summary);
      sendTo(ws, { type: 'init', you: summary(me), spawn: sp, players: others });
      broadcast({ type: 'join', player: summary(me) });
      return;
    }

    if (!me) return;

    // ---- trocar de nick ----
    if (msg.type === 'setname') {
      me.name = String(msg.name || 'Jogador').slice(0, 16);
      broadcast({ type: 'rename', id: me.id, name: me.name });
      return;
    }

    // ---- posição/rotação (relay para todos) ----
    if (msg.type === 'state') {
      me.x = msg.x; me.y = msg.y; me.z = msg.z; me.yaw = msg.yaw;
      broadcast({ type: 'state', id: me.id, x: me.x, y: me.y, z: me.z, yaw: me.yaw });
      return;
    }

    // ---- tiro (feedback visual para todos) ----
    if (msg.type === 'shoot') {
      broadcast({ type: 'shoot', id: me.id, x: msg.x, y: msg.y, z: msg.z, dx: msg.dx, dy: msg.dy, dz: msg.dz });
      return;
    }

    // ---- acerto: servidor autoritativo na vida/placar ----
    if (msg.type === 'hit') {
      const target = players.get(msg.target);
      if (!target || target === me) return;
      target.hp -= DAMAGE;
      if (target.hp <= 0) {
        me.score += 1;
        target.hp = MAX_HP;
        const sp = randomSpawn();
        target.x = sp.x; target.z = sp.z; target.yaw = sp.yaw;
        broadcast({ type: 'kill', shooter: me.id, target: target.id, shooterScore: me.score }, true);
        broadcast({ type: 'respawn', id: target.id, x: sp.x, y: 1.7, z: sp.z, yaw: sp.yaw, hp: MAX_HP }, true);
      } else {
        broadcast({ type: 'health', id: target.id, hp: target.hp }, true);
      }
      return;
    }
  });

  ws.on('close', () => {
    if (me) {
      players.delete(me.id);
      broadcast({ type: 'leave', id: me.id });
    }
  });
});

// mantém conexões vivas / derruba sockets mortos
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Cylinder Duel (arena única) rodando em http://localhost:${PORT}`);
});
