# Cylinder Duel — arena online

Arena 3D em primeira pessoa, **todos contra todos pela internet**. Cenário branco vazio,
cada jogador é um cilindro. **Servidor único e fixo: todo mundo que entra cai na mesma
arena, sem limite de jogadores.** Three.js no cliente + servidor Node (WebSocket) fazendo
o relay em tempo real.

> Um **único serviço** serve o jogo **e** a parte online — então é **um só deploy**.

## Como rodar localmente

```bash
npm install
npm start
# abre http://localhost:3000
```

Abra a URL e clique **JOGAR**. Para jogar com mais gente, é só todo mundo abrir a **mesma URL**
(em outra aba/outro PC/celular) — todos entram automaticamente na mesma arena.

## Controles

**Computador:** **W A S D** mover · **Mouse** mirar (clique pra travar o cursor) · **Clique** atirar · **Shift** correr

**Celular / tela de toque:** dois analógicos virtuais — **esquerdo** move, **direito** mira — + botão **ATIRAR**.
Botão **⛶** entra em tela cheia e tenta travar na horizontal; aparece um aviso "gire o aparelho" no retrato.
Botão **≡** volta ao menu.

4 acertos abatem um jogador. A vida e o placar são autoritativos no servidor (todos ficam sincronizados).

## Recursos

- **Servidor único, todos contra todos, sem limite de jogadores.**
- **Nickname** digitável (salvo no navegador), mostrado flutuando sobre cada jogador e no placar.
- **Placar ao vivo** com todos os jogadores online e seus abates; contador de jogadores.
- **FPS** e **ping** em tempo real na HUD (ping medido por eco WebSocket).

## Hospedagem grátis (precisa rodar Node — host estático NÃO serve)

Multiplayer em tempo real precisa de um servidor com conexão aberta (WebSocket).
Por isso Netlify/GitHub Pages/Vercel-estático **não funcionam** aqui. Use um host de Node:

### Opção recomendada: Render (free, sem cartão) ⭐

1. Suba este projeto pro **GitHub** (um repo novo).
2. Em <https://render.com> → **New** → **Web Service** → conecte o repo.
3. Render lê o `render.yaml` sozinho (ou configure: Build `npm install`, Start `npm start`, plano **Free**).
4. Deploy. Você recebe uma URL `https://...onrender.com` — é só compartilhar.

⚠️ **Pegadinha do plano free:** o serviço "dorme" após ~15 min sem ninguém. O **primeiro**
acesso depois disso leva ~50s pra acordar. Depois fica normal. Pra hobby/2 amigos, ok.

### Alternativa sem cold start: Fly.io

Sem "dormir", latência melhor, mas **pede cartão** (não cobra no free).

```bash
npm i -g flyctl
fly launch        # detecta Node; aceite os padrões
fly deploy
```

### Outras que funcionam

- **Railway** — crédito grátis mensal, deploy direto do GitHub.
- Qualquer **VPS** (Node + porta liberada).

## Estrutura

```
server.js          # serve /public + relay WebSocket (arena única, vida/placar autoritativos)
public/index.html  # o jogo (Three.js, primeira pessoa, rede)
package.json       # dep: ws
render.yaml        # blueprint do Render (deploy free)
```

## Notas técnicas

- **Arena única:** sem salas e sem limite — todo `join` entra no mesmo conjunto global de jogadores.
- **Rede:** cada cliente manda posição/rotação ~20x/s; o servidor repassa para todos e é autoritativo
  na vida e no placar (acerto é detectado no cliente atirador — simples e suficiente entre amigos).
  O relay é O(N²) por tick, ok para dezenas de jogadores num servidor hobby.
- **Cores:** distribuídas por uma paleta de 8 (ciclam acima disso) para diferenciar os jogadores.
- **Porta:** vem de `process.env.PORT` (exigido por Render/Fly) ou 3000 no local.
