# Cylinder Duel — 1v1 online

Duelo 3D em primeira pessoa para **dois humanos pela internet**. Cenário branco vazio,
cada jogador é um cilindro, um atira no outro. Three.js no cliente + servidor Node
(WebSocket) fazendo o relay em tempo real.

> Um **único serviço** serve o jogo **e** a parte online — então é **um só deploy**.

## Como rodar localmente

```bash
npm install
npm start
# abre http://localhost:3000
```

Abra a URL, copie o link da sala (já vem com `?room=xxxxx`) e abra em **outra aba/outro PC**
pra entrar como o segundo jogador. Os dois precisam da **mesma sala** (mesmo `?room=`).

## Controles

**Computador:** **W A S D** mover · **Mouse** mirar (clique pra travar o cursor) · **Clique** atirar · **Shift** correr

**Celular / tela de toque:** dois analógicos virtuais — **esquerdo** move, **direito** mira — + botão **ATIRAR**.
Botão **⛶** entra em tela cheia e tenta travar na horizontal; aparece um aviso "gire o aparelho" no retrato.
Botão **≡** volta ao menu.

4 acertos abatem o oponente. A vida e o placar são autoritativos no servidor (os dois lados ficam sincronizados).

## Recursos

- **Nickname** digitável (salvo no navegador), mostrado flutuando sobre o oponente e na HUD.
- **FPS** e **ping** em tempo real na HUD (ping medido por eco WebSocket).
- **Salas por link** (`?room=`), até 2 jogadores por sala.

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
server.js          # serve /public + relay WebSocket (sala de até 2, vida/placar autoritativos)
public/index.html  # o jogo (Three.js, primeira pessoa, rede)
package.json       # dep: ws
render.yaml        # blueprint do Render (deploy free)
```

## Notas técnicas

- **Salas:** quem chega define/usa `?room=CÓDIGO`; até 2 por sala (3º recebe "sala cheia").
- **Rede:** cada cliente manda posição/rotação ~20x/s; o servidor repassa e é autoritativo
  na vida e no placar (acerto é detectado no cliente atirador — simples e suficiente entre amigos).
- **Porta:** vem de `process.env.PORT` (exigido por Render/Fly) ou 3000 no local.
