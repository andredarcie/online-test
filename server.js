// Cylinder Duel — servidor único:
//  1) serve os arquivos estáticos de /public (o jogo)
//  2) faz o relay em tempo real entre os dois jogadores via WebSocket
//
// Roda em qualquer host Node persistente (Render, Fly.io, Railway, VPS, local).
// Porta vem de process.env.PORT (exigido por Render/Fly) ou 3000 no local.

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

    // impede path traversal: resolve dentro de PUBLIC
    const filePath = normalize(join(PUBLIC, urlPath));
    if (!filePath.startsWith(PUBLIC)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
});

// ---------- Servidor WebSocket (relay do jogo) ----------
const wss = new WebSocketServer({ server });

// Configuração do duelo
const SLOTS = [
  { color: 0xe23344, spawn: { x: 0, z: 20, yaw: Math.PI } },   // jogador 0: vermelho, olhando -Z
  { color: 0x2255dd, spawn: { x: 0, z: -20, yaw: 0 } },        // jogador 1: azul, olhando +Z
];
const MAX_HP = 100;
const DAMAGE = 25; // 4 acertos = abate

/** @type {Map<string, Room>} */
const rooms = new Map();
let nextId = 1;

class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map(); // id -> player
  }
}

function summary(p) {
  return { id: p.id, slot: p.slot, color: p.color, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, score: p.score, name: p.name };
}

function randomSpawn() {
  const a = Math.random() * Math.PI * 2;
  const r = 16 + Math.random() * 14;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: Math.random() * Math.PI * 2 };
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let room = null;
  let me = null;

  const sendTo = (target, obj) => {
    if (target.readyState === target.OPEN) target.send(JSON.stringify(obj));
  };
  const broadcast = (obj, includeSelf = false) => {
    if (!room) return;
    for (const p of room.players.values()) {
      if (!includeSelf && p === me) continue;
      sendTo(p.ws, obj);
    }
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ---- medição de ping (eco imediato, funciona antes mesmo de entrar) ----
    if (msg.type === 'ping') {
      sendTo(ws, { type: 'pong', t: msg.t });
      return;
    }

    // ---- entrar numa sala ----
    if (msg.type === 'join') {
      if (me) return;
      const roomId = String(msg.room || 'default').slice(0, 24);
      room = rooms.get(roomId) || new Room(roomId);
      rooms.set(roomId, room);

      if (room.players.size >= 2) {
        sendTo(ws, { type: 'full' });
        return;
      }

      const slot = room.players.size; // 0 ou 1
      const cfg = SLOTS[slot];
      me = {
        id: 'p' + (nextId++),
        ws,
        slot,
        color: cfg.color,
        x: cfg.spawn.x, y: 1.7, z: cfg.spawn.z, yaw: cfg.spawn.yaw,
        hp: MAX_HP, score: 0,
        name: String(msg.name || 'Jogador').slice(0, 16),
      };
      room.players.set(me.id, me);

      // manda o estado inicial pro recém-chegado (incluindo quem já está na sala)
      const others = [...room.players.values()].filter((p) => p !== me).map(summary);
      sendTo(ws, { type: 'init', you: summary(me), spawn: cfg.spawn, players: others });
      // avisa os outros
      broadcast({ type: 'join', player: summary(me) });
      return;
    }

    if (!me || !room) return;

    // ---- trocar de nick ----
    if (msg.type === 'setname') {
      me.name = String(msg.name || 'Jogador').slice(0, 16);
      broadcast({ type: 'rename', id: me.id, name: me.name });
      return;
    }

    // ---- posição/rotação (relay puro) ----
    if (msg.type === 'state') {
      me.x = msg.x; me.y = msg.y; me.z = msg.z; me.yaw = msg.yaw;
      broadcast({ type: 'state', id: me.id, x: me.x, y: me.y, z: me.z, yaw: me.yaw });
      return;
    }

    // ---- tiro (só feedback visual no outro cliente) ----
    if (msg.type === 'shoot') {
      broadcast({ type: 'shoot', id: me.id, x: msg.x, y: msg.y, z: msg.z, dx: msg.dx, dy: msg.dy, dz: msg.dz });
      return;
    }

    // ---- acerto: servidor é autoritativo na vida/placar ----
    if (msg.type === 'hit') {
      const target = room.players.get(msg.target);
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
    if (room && me) {
      room.players.delete(me.id);
      broadcast({ type: 'leave', id: me.id });
      if (room.players.size === 0) rooms.delete(room.id);
    }
  });
});

// mantém conexões vivas / derruba sockets mortos (importante em hosts free)
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Cylinder Duel rodando em http://localhost:${PORT}`);
});
