const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'herois-improvaveis-secret-2024';
const DATA_DIR = path.join(__dirname, 'data');

// ── Ensure data dir ──────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ── JSON DB helpers ──────────────────────────────────────────────
function readDB(name) {
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function writeDB(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

// Initialize DBs
['users', 'sessions', 'history', 'sheets'].forEach(name => {
  if (!fs.existsSync(path.join(DATA_DIR, `${name}.json`))) writeDB(name, {});
});

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth label helper (must be before routes and socket) ─────────
function getAuthorLabel(username, displayName) {
  const sheets = readDB('sheets');
  const sheet = sheets[username];
  if (sheet && sheet.name) return `${sheet.name} (${displayName})`;
  return displayName;
}

// ── Auth middleware ──────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token inválido' }); }
}

function masterOnly(req, res, next) {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Apenas o Mestre pode fazer isso' });
  next();
}

// ══════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readDB('users');
  const user = users[username];
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
  if (!bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Senha incorreta' });
  const token = jwt.sign(
    { username, role: user.role, displayName: user.displayName },
    JWT_SECRET, { expiresIn: '7d' }
  );
  res.json({ token, role: user.role, displayName: user.displayName, username });
});

// Register player (master only via POST /api/users)
app.post('/api/users', authMiddleware, masterOnly, (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha obrigatórios' });
  const users = readDB('users');
  if (users[username]) return res.status(409).json({ error: 'Usuário já existe' });
  users[username] = {
    username,
    password: bcrypt.hashSync(password, 10),
    displayName: displayName || username,
    role: role || 'player',
    createdAt: new Date().toISOString()
  };
  writeDB('users', users);
  res.json({ ok: true, username });
});

// List users (master only)
app.get('/api/users', authMiddleware, masterOnly, (req, res) => {
  const users = readDB('users');
  const list = Object.values(users).map(u => ({
    username: u.username, displayName: u.displayName,
    role: u.role, createdAt: u.createdAt
  }));
  res.json(list);
});

// Delete user (master only)
app.delete('/api/users/:username', authMiddleware, masterOnly, (req, res) => {
  const users = readDB('users');
  if (!users[req.params.username]) return res.status(404).json({ error: 'Não encontrado' });
  delete users[req.params.username];
  writeDB('users', users);
  res.json({ ok: true });
});

// Change own password
app.post('/api/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const users = readDB('users');
  const user = users[req.user.username];
  if (!bcrypt.compareSync(oldPassword, user.password))
    return res.status(401).json({ error: 'Senha atual incorreta' });
  user.password = bcrypt.hashSync(newPassword, 10);
  writeDB('users', users);
  res.json({ ok: true });
});

// First-time setup: create master if no users exist
app.post('/api/setup', (req, res) => {
  const users = readDB('users');
  if (Object.keys(users).length > 0)
    return res.status(403).json({ error: 'Setup já realizado' });
  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Dados incompletos' });
  users[username] = {
    username, password: bcrypt.hashSync(password, 10),
    displayName: displayName || username,
    role: 'master', createdAt: new Date().toISOString()
  };
  writeDB('users', users);
  res.json({ ok: true, message: 'Mestre criado com sucesso!' });
});

// Check if setup is needed
app.get('/api/setup', (req, res) => {
  const users = readDB('users');
  res.json({ needsSetup: Object.keys(users).length === 0 });
});

// ══════════════════════════════════════════════════════════════════
// SHEET ROUTES
// ══════════════════════════════════════════════════════════════════

// Save sheet
app.post('/api/sheets', authMiddleware, (req, res) => {
  const sheets = readDB('sheets');
  sheets[req.user.username] = {
    ...req.body,
    username: req.user.username,
    updatedAt: new Date().toISOString()
  };
  writeDB('sheets', sheets);
  res.json({ ok: true });
});

// Get own sheet
app.get('/api/sheets/me', authMiddleware, (req, res) => {
  const sheets = readDB('sheets');
  res.json(sheets[req.user.username] || null);
});

// Get all sheets (master)
app.get('/api/sheets', authMiddleware, masterOnly, (req, res) => {
  const sheets = readDB('sheets');
  res.json(Object.values(sheets));
});

// Get specific player sheet (master)
app.get('/api/sheets/:username', authMiddleware, masterOnly, (req, res) => {
  const sheets = readDB('sheets');
  res.json(sheets[req.params.username] || null);
});

// Update sheet stats (master can update any, player only own)
app.patch('/api/sheets/:username', authMiddleware, (req, res) => {
  if (req.user.role !== 'master' && req.user.username !== req.params.username)
    return res.status(403).json({ error: 'Sem permissão' });
  const sheets = readDB('sheets');
  if (!sheets[req.params.username]) return res.status(404).json({ error: 'Ficha não encontrada' });
  sheets[req.params.username] = { ...sheets[req.params.username], ...req.body, updatedAt: new Date().toISOString() };
  writeDB('sheets', sheets);
  io.to('session').emit('sheet_updated', { username: req.params.username, sheet: sheets[req.params.username] });
  res.json({ ok: true });
});

// Delete sheet (master only)
app.delete('/api/sheets/:username', authMiddleware, masterOnly, (req, res) => {
  const sheets = readDB('sheets');
  if (!sheets[req.params.username]) return res.status(404).json({ error: 'Ficha não encontrada' });
  delete sheets[req.params.username];
  writeDB('sheets', sheets);
  io.to('session').emit('sheet_removed', { username: req.params.username });
  res.json({ ok: true });
});

// Upload sheet for a specific player (master only)
app.post('/api/sheets/:username', authMiddleware, masterOnly, (req, res) => {
  const sheets = readDB('sheets');
  sheets[req.params.username] = {
    ...req.body,
    username: req.params.username,
    updatedAt: new Date().toISOString()
  };
  writeDB('sheets', sheets);
  io.to('session').emit('sheet_updated', { username: req.params.username, sheet: sheets[req.params.username] });
  // Refresh display names for all online users
  const users = readDB('users');
  const updated = Array.from(onlineUsers.entries()).map(([sid, u]) => ({
    ...u,
    displayName: getAuthorLabel(u.username, users[u.username]?.displayName || u.username)
  }));
  io.to('session').emit('users_online', updated);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// SESSION ROUTES
// ══════════════════════════════════════════════════════════════════

// Get current session info
app.get('/api/session', authMiddleware, (req, res) => {
  const sessions = readDB('sessions');
  res.json(sessions.current || { active: false });
});

// Create/update session (master)
app.post('/api/session', authMiddleware, masterOnly, (req, res) => {
  const sessions = readDB('sessions');
  sessions.current = {
    ...req.body,
    id: sessions.current?.id || uuidv4(),
    active: true,
    startedAt: sessions.current?.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  writeDB('sessions', sessions);
  io.to('session').emit('session_updated', sessions.current);
  res.json(sessions.current);
});

// Close session (master)
app.delete('/api/session', authMiddleware, masterOnly, (req, res) => {
  const sessions = readDB('sessions');
  if (sessions.current) { sessions.current.active = false; sessions.current.endedAt = new Date().toISOString(); }
  writeDB('sessions', sessions);
  io.to('session').emit('session_closed');
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// HISTORY ROUTES
// ══════════════════════════════════════════════════════════════════

app.get('/api/history', authMiddleware, (req, res) => {
  const history = readDB('history');
  const msgs = Object.values(history).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const limit = parseInt(req.query.limit) || 200;
  res.json(msgs.slice(-limit));
});

// ══════════════════════════════════════════════════════════════════
// SOCKET.IO
// ══════════════════════════════════════════════════════════════════

// Online users map: socketId -> user info
const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Token ausente'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { next(new Error('Token inválido')); }
});

io.on('connection', (socket) => {
  const user = socket.user;
  socket.join('session');

  // Register online — use character name if sheet exists
  const authorLabel = getAuthorLabel(user.username, user.displayName);
  onlineUsers.set(socket.id, { username: user.username, displayName: authorLabel, role: user.role });
  io.to('session').emit('users_online', Array.from(onlineUsers.values()));

  // Send recent history to new connection
  const history = readDB('history');
  const recent = Object.values(history)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-100);
  socket.emit('history_load', recent);

  // Send current sheets
  const sheets = readDB('sheets');
  socket.emit('sheets_load', Object.values(sheets));

  // Send intro if set and user is a player
  const sessions = readDB('sessions');
  if (user.role !== 'master' && sessions.current?.intro) {
    socket.emit('show_intro', { text: sessions.current.intro });
  }

  console.log(`✅ ${authorLabel} (${user.role}) conectou`);

  // ── NARRATIVE MESSAGE (master only) ──
  socket.on('narrate', (data) => {
    if (user.role !== 'master') return;
    const msg = {
      id: uuidv4(), type: 'narrate',
      author: getAuthorLabel(user.username, user.displayName),
      username: user.username,
      content: data.content,
      timestamp: new Date().toISOString()
    };
    saveAndBroadcast(msg);
  });

  // ── PLAYER ACTION ──
  socket.on('action', (data) => {
    const msg = {
      id: uuidv4(), type: 'action',
      author: getAuthorLabel(user.username, user.displayName),
      username: user.username,
      role: user.role,
      content: data.content,
      timestamp: new Date().toISOString()
    };
    saveAndBroadcast(msg);
  });

  // ── DICE ROLL ──
  socket.on('roll', (data) => {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const attr = parseInt(data.attr) || 0;
    const attrName = data.attrName || '';
    const total = d1 + d2 + attr;
    const isCritical = d1 === 6 && d2 === 6;
    const isFumble = d1 === 1 && d2 === 1;
    const msg = {
      id: uuidv4(), type: 'roll',
      author: getAuthorLabel(user.username, user.displayName),
      username: user.username,
      d1, d2, attr, attrName, total, isCritical, isFumble,
      timestamp: new Date().toISOString()
    };
    saveAndBroadcast(msg);
  });

  // ── CUSTOM ROLL ──
  socket.on('roll_custom', (data) => {
    const qty   = Math.min(parseInt(data.qty)||1, 20);
    const faces = Math.min(parseInt(data.faces)||6, 1000);
    const bonus = parseInt(data.bonus)||0;
    const difficulty = parseInt(data.difficulty)||0;
    const rolls = Array.from({length: qty}, () => Math.floor(Math.random() * faces) + 1);
    const sum = rolls.reduce((a,b) => a+b, 0);
    const total = sum + bonus;
    const isCritical = qty === 2 && faces === 6 && rolls[0] === 6 && rolls[1] === 6;
    const isFumble   = qty === 2 && faces === 6 && rolls[0] === 1 && rolls[1] === 1;
    const msg = {
      id: uuidv4(), type: 'roll_custom',
      author: getAuthorLabel(user.username, user.displayName),
      username: user.username,
      qty, faces, bonus, rolls, total, difficulty, isCritical, isFumble,
      timestamp: new Date().toISOString()
    };
    saveAndBroadcast(msg);
  });

  // ── DIFFICULTY ──
  socket.on('difficulty_set', (data) => {
    if (user.role !== 'master') return;
    io.to('session').emit('difficulty_set', data);
  });

  // ── CHAT ──
  socket.on('chat', (data) => {
    const msg = {
      id: uuidv4(), type: 'chat',
      author: getAuthorLabel(user.username, user.displayName),
      username: user.username, role: user.role,
      content: data.content,
      timestamp: new Date().toISOString()
    };
    // Chat NOT saved to history — only in session
    io.to('session').emit('message', msg);
  });

  // ── UPDATE SHEET STATS (VIT/VON in real time) ──
  socket.on('update_stats', (data) => {
    const target = data.username;
    if (user.role !== 'master' && user.username !== target) return;
    const sheets = readDB('sheets');
    if (!sheets[target]) return;
    sheets[target] = { ...sheets[target], ...data.stats, updatedAt: new Date().toISOString() };
    writeDB('sheets', sheets);
    io.to('session').emit('sheet_updated', { username: target, sheet: sheets[target] });
    // Refresh online users list so display names update immediately
    const updated = Array.from(onlineUsers.entries()).map(([sid, u]) => ({
      ...u,
      displayName: getAuthorLabel(u.username, u.displayName.split(' (')[0])
    }));
    io.to('session').emit('users_online', updated);
  });

  // ── DISCONNECT ──
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.to('session').emit('users_online', Array.from(onlineUsers.values()));
    console.log(`❌ ${getAuthorLabel(user.username, user.displayName)} desconectou`);
  });
});

function saveAndBroadcast(msg) {
  const history = readDB('history');
  history[msg.id] = msg;
  writeDB('history', history);
  io.to('session').emit('message', msg);
}

// ── Start ────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🎮 Heróis Improváveis — Plataforma`);
  console.log(`🌐 Rodando em http://localhost:${PORT}`);
  console.log(`📁 Dados em: ${DATA_DIR}\n`);
});
