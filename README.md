# ⚡ Heróis Improváveis — Plataforma de RPG

Plataforma multiplayer para o **Sistema 4C — Heróis Improváveis**, desenvolvida por Ismael "Mael Retro RPG" Netto Spinelli.

---

## 🌐 Acesso

**https://herois-plataforma-production.up.railway.app**

> O acesso à plataforma é restrito — login e senha são fornecidos pelo Mestre.

---

## 📁 Estrutura

```
herois-plataforma/
├── server.js
├── package.json
├── data/
└── public/
    ├── index.html
    ├── player.html
    ├── master.html
    ├── ficha_herois.html
    ├── fastplay_4c.html
    └── css/
        └── shared.css
```

---

## 🚀 Instalação local

```bash
npm install
npm start
```

Acesse em **http://localhost:3000**

Na primeira vez, crie a conta do Mestre na tela inicial.

---

## 👥 Funções

- **Mestre** — narra, gerencia fichas e jogadores, controla a sessão
- **Jogador** — envia ficha, age na narrativa, rola dados
