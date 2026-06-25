# ⚡ Heróis Improváveis — Plataforma de RPG

Plataforma multiplayer para o Sistema 4C — Heróis Improváveis.

---

## 📁 Estrutura

```
herois-plataforma/
├── server.js          ← Servidor principal
├── package.json       ← Dependências
├── data/              ← Banco de dados JSON (criado automaticamente)
│   ├── users.json
│   ├── sheets.json
│   ├── sessions.json
│   └── history.json
└── public/
    ├── index.html          ← Tela de login
    ├── player.html         ← Tela do jogador
    ├── master.html         ← Tela do mestre
    ├── ficha_herois.html   ← Ficha de personagem interativa
    ├── fastplay_4c.html    ← Manual fastplay do Sistema 4C
    └── css/
        └── shared.css
```

> **Importante:** os arquivos `ficha_herois.html` e `fastplay_4c.html` devem estar dentro da pasta `public/` para ficarem acessíveis pelos links do header da plataforma.

---

## 🚀 Como rodar localmente

### 1. Instalar Node.js
Baixe em https://nodejs.org (versão LTS)

### 2. Instalar dependências
Abra o terminal na pasta do projeto e rode:
```bash
npm install
```

### 3. Iniciar o servidor
```bash
npm start
```

### 4. Acessar
Abra no navegador: **http://localhost:3000**

Na primeira vez, será pedido para criar a conta do Mestre.

---

## 🌐 Como usar com Hamachi

1. Instale o Hamachi e crie uma rede
2. Compartilhe o nome e senha da rede com os jogadores
3. Eles entram na rede pelo Hamachi
4. Rode o servidor normalmente: `npm start`
5. Jogadores acessam pelo seu IP Hamachi:
   - Ex: **http://25.xx.xx.xx:3000**
   - Seu IP Hamachi aparece no painel do Hamachi

---

## ☁️ Como subir no Railway

1. Crie uma conta em https://railway.app
2. Crie um repositório no GitHub com estes arquivos
3. No Railway: **New Project → Deploy from GitHub**
4. Selecione o repositório
5. O Railway detecta o `package.json` e faz o deploy automaticamente
6. Acesse pela URL gerada (ex: `herois.railway.app`)

### Variáveis de ambiente no Railway (opcional)
```
JWT_SECRET=sua-chave-secreta-aqui
PORT=3000
```

---

## 🎮 Como jogar

### Mestre:
1. Acesse e faça login com a conta de mestre
2. Na aba **Jogadores**, crie as contas dos jogadores
3. Na aba **Sessão**, narre a história e role dados
4. Acompanhe as fichas em tempo real no HUD lateral

### Jogadores:
1. Entram com login e senha fornecidos pelo mestre
2. Clicam em **📄 Ficha** e carregam o JSON salvo na ficha de personagem (`ficha_herois.html`)
3. Digitam suas ações na área de input
4. Rolam dados clicando nos botões de atributo (ATQ, RES, SAB, AGI)
5. Conversam no chat lateral

---

## 💡 Funcionalidades

- ✅ Login com usuário e senha (bcrypt)
- ✅ Mestre cria contas dos jogadores
- ✅ Fichas carregadas do HTML da ficha de personagem
- ✅ HUD com VIT/VON em tempo real para todos
- ✅ Mestre e jogadores editam VIT/VON durante a sessão
- ✅ Rolagem de dados visível para todos (2d6 + atributo)
- ✅ Acerto Decisivo (duplo 6) e Falha Crítica (duplo 1) destacados
- ✅ Histórico salvo — quem entrou depois pode ler o que aconteceu
- ✅ Chat lateral para conversa da party
- ✅ Funciona local, Hamachi e Railway sem alteração
