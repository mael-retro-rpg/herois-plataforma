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

// ── Ensure data dirs ─────────────────────────────────────────────
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
function readRoomDB(roomId, name) {
  const dir = path.join(DATA_DIR, 'rooms', roomId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function writeRoomDB(roomId, name, data) {
  const dir = path.join(DATA_DIR, 'rooms', roomId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2));
}

// ── Init global DBs ──────────────────────────────────────────────
['users'].forEach(name => {
  if (!fs.existsSync(path.join(DATA_DIR, `${name}.json`))) writeDB(name, {});
});

// ── Default rooms ────────────────────────────────────────────────
function initDefaultRooms() {
  const rooms = readDB('rooms');
  const defaults = [
    { id: 'herois',     name: 'Heróis Improváveis',    description: 'Sistema 4C · Riacho Doce · Colégio Dom Álvaro', icon: '⚡', color: '#c8f03a' },
    { id: 'defensores', name: 'Defensores do Paraíso',  description: 'Sistema 4C · HyBrasil', icon: '🛡️', color: '#3affc8' },
    { id: 'kaitro',     name: 'Crônicas de Kaitro',     description: 'Sistema 4C · Mundo de Kaitro', icon: '⚔️', color: '#c87bff' },
  ];
  let changed = false;
  defaults.forEach(r => { if (!rooms[r.id]) { rooms[r.id] = r; changed = true; } });
  if (changed) writeDB('rooms', rooms);
}
initDefaultRooms();

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth helpers ─────────────────────────────────────────────────
function getAuthorLabel(username, displayName, roomId) {
  if (roomId) {
    const sheets = readRoomDB(roomId, 'sheets');
    const sheet = sheets[username];
    if (sheet && sheet.name) return `${sheet.name} (${displayName})`;
  }
  return displayName;
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}
function masterOnly(req, res, next) {
  if (req.user.role !== 'master') return res.status(403).json({ error: 'Apenas o Mestre' });
  next();
}

// ══════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════════
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readDB('users');
  const user = users[username];
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Senha incorreta' });
  const token = jwt.sign({ username, role: user.role, displayName: user.displayName }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, role: user.role, displayName: user.displayName, username });
});

app.post('/api/setup', (req, res) => {
  const users = readDB('users');
  if (Object.keys(users).length > 0) return res.status(403).json({ error: 'Setup já realizado' });
  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Dados incompletos' });
  users[username] = { username, password: bcrypt.hashSync(password, 10), displayName: displayName || username, role: 'master', createdAt: new Date().toISOString() };
  writeDB('users', users);
  res.json({ ok: true });
});

app.get('/api/setup', (req, res) => {
  const users = readDB('users');
  res.json({ needsSetup: Object.keys(users).length === 0 });
});

// ══════════════════════════════════════════════════════════════════
// USER ROUTES
// ══════════════════════════════════════════════════════════════════
app.get('/api/users', authMiddleware, masterOnly, (req, res) => {
  const users = readDB('users');
  res.json(Object.values(users).map(u => ({ username: u.username, displayName: u.displayName, role: u.role, createdAt: u.createdAt })));
});

app.post('/api/users', authMiddleware, masterOnly, (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha obrigatórios' });
  const users = readDB('users');
  if (users[username]) return res.status(409).json({ error: 'Usuário já existe' });
  users[username] = { username, password: bcrypt.hashSync(password, 10), displayName: displayName || username, role: role || 'player', createdAt: new Date().toISOString() };
  writeDB('users', users);
  res.json({ ok: true });
});

app.delete('/api/users/:username', authMiddleware, masterOnly, (req, res) => {
  const users = readDB('users');
  if (!users[req.params.username]) return res.status(404).json({ error: 'Não encontrado' });
  delete users[req.params.username];
  writeDB('users', users);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// ROOM ROUTES
// ══════════════════════════════════════════════════════════════════
app.get('/api/rooms', authMiddleware, (req, res) => {
  const rooms = readDB('rooms');
  // Add online count per room
  const result = Object.values(rooms).map(r => ({
    ...r,
    online: Array.from(onlineUsers.values()).filter(u => u.roomId === r.id).length
  }));
  res.json(result);
});

app.post('/api/rooms', authMiddleware, masterOnly, (req, res) => {
  const { name, description, icon, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const rooms = readDB('rooms');
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30) + '_' + Date.now().toString(36);
  rooms[id] = { id, name, description: description || '', icon: icon || '🎲', color: color || '#c8f03a', createdAt: new Date().toISOString() };
  writeDB('rooms', rooms);
  res.json(rooms[id]);
});

app.delete('/api/rooms/:id', authMiddleware, masterOnly, (req, res) => {
  const rooms = readDB('rooms');
  const fixed = ['herois', 'defensores', 'kaitro'];
  if (fixed.includes(req.params.id)) return res.status(403).json({ error: 'Sala padrão não pode ser removida' });
  delete rooms[req.params.id];
  writeDB('rooms', rooms);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// SHEET ROUTES (per room)
// ══════════════════════════════════════════════════════════════════
app.post('/api/rooms/:roomId/sheets', authMiddleware, (req, res) => {
  const sheets = readRoomDB(req.params.roomId, 'sheets');
  sheets[req.user.username] = { ...req.body, username: req.user.username, updatedAt: new Date().toISOString() };
  writeRoomDB(req.params.roomId, 'sheets', sheets);
  io.to(`room:${req.params.roomId}`).emit('sheet_updated', { username: req.user.username, sheet: sheets[req.user.username] });
  emitUsersStatus(req.params.roomId);
  res.json({ ok: true });
});

app.get('/api/rooms/:roomId/sheets', authMiddleware, masterOnly, (req, res) => {
  res.json(Object.values(readRoomDB(req.params.roomId, 'sheets')));
});

app.post('/api/rooms/:roomId/sheets/:username', authMiddleware, masterOnly, (req, res) => {
  const sheets = readRoomDB(req.params.roomId, 'sheets');
  sheets[req.params.username] = { ...req.body, username: req.params.username, updatedAt: new Date().toISOString() };
  writeRoomDB(req.params.roomId, 'sheets', sheets);
  io.to(`room:${req.params.roomId}`).emit('sheet_updated', { username: req.params.username, sheet: sheets[req.params.username] });
  emitUsersStatus(req.params.roomId);
  res.json({ ok: true });
});

app.delete('/api/rooms/:roomId/sheets/:username', authMiddleware, masterOnly, (req, res) => {
  const sheets = readRoomDB(req.params.roomId, 'sheets');
  delete sheets[req.params.username];
  writeRoomDB(req.params.roomId, 'sheets', sheets);
  io.to(`room:${req.params.roomId}`).emit('sheet_removed', { username: req.params.username });
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// SESSION ROUTES (per room)
// ══════════════════════════════════════════════════════════════════
app.get('/api/rooms/:roomId/session', authMiddleware, (req, res) => {
  res.json(readRoomDB(req.params.roomId, 'session'));
});

app.post('/api/rooms/:roomId/session', authMiddleware, masterOnly, (req, res) => {
  const session = { ...readRoomDB(req.params.roomId, 'session'), ...req.body, updatedAt: new Date().toISOString() };
  writeRoomDB(req.params.roomId, 'session', session);
  io.to(`room:${req.params.roomId}`).emit('session_updated', session);
  res.json(session);
});

// ══════════════════════════════════════════════════════════════════
// HISTORY ROUTES (per room)
// ══════════════════════════════════════════════════════════════════
app.get('/api/rooms/:roomId/history', authMiddleware, (req, res) => {
  const history = readRoomDB(req.params.roomId, 'history');
  const msgs = Object.values(history).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  res.json(msgs.slice(-(parseInt(req.query.limit) || 200)));
});

// ══════════════════════════════════════════════════════════════════
// DOCS ROUTES (per room)
// ══════════════════════════════════════════════════════════════════

// Get all docs (folders + documents)
app.get('/api/rooms/:roomId/docs', authMiddleware, (req, res) => {
  res.json(readRoomDB(req.params.roomId, 'docs') || { folders: {}, docs: {} });
});

// Create or update a document
app.post('/api/rooms/:roomId/docs/:docId', authMiddleware, masterOnly, (req, res) => {
  const db = readRoomDB(req.params.roomId, 'docs') || { folders: {}, docs: {} };
  if (!db.docs) db.docs = {};
  db.docs[req.params.docId] = {
    ...req.body,
    id: req.params.docId,
    updatedAt: new Date().toISOString()
  };
  writeRoomDB(req.params.roomId, 'docs', db);
  io.to(`room:${req.params.roomId}`).emit('docs_updated', db);
  res.json({ ok: true });
});

// Delete a document
app.delete('/api/rooms/:roomId/docs/:docId', authMiddleware, masterOnly, (req, res) => {
  const db = readRoomDB(req.params.roomId, 'docs') || { folders: {}, docs: {} };
  delete db.docs?.[req.params.docId];
  writeRoomDB(req.params.roomId, 'docs', db);
  io.to(`room:${req.params.roomId}`).emit('docs_updated', db);
  res.json({ ok: true });
});

// Create or rename a folder
app.post('/api/rooms/:roomId/docs-folder', authMiddleware, masterOnly, (req, res) => {
  const db = readRoomDB(req.params.roomId, 'docs') || { folders: {}, docs: {} };
  if (!db.folders) db.folders = {};
  const { id, name } = req.body;
  db.folders[id] = { id, name, createdAt: new Date().toISOString() };
  writeRoomDB(req.params.roomId, 'docs', db);
  io.to(`room:${req.params.roomId}`).emit('docs_updated', db);
  res.json({ ok: true });
});

// Delete a folder (and its docs)
app.delete('/api/rooms/:roomId/docs-folder/:folderId', authMiddleware, masterOnly, (req, res) => {
  const db = readRoomDB(req.params.roomId, 'docs') || { folders: {}, docs: {} };
  delete db.folders?.[req.params.folderId];
  // Remove docs in this folder
  Object.keys(db.docs || {}).forEach(id => {
    if (db.docs[id].folderId === req.params.folderId) delete db.docs[id];
  });
  writeRoomDB(req.params.roomId, 'docs', db);
  io.to(`room:${req.params.roomId}`).emit('docs_updated', db);
  res.json({ ok: true });
});
app.get('/api/backup', authMiddleware, masterOnly, (req, res) => {
  const rooms = readDB('rooms');
  const roomData = {};
  Object.keys(rooms).forEach(id => {
    roomData[id] = {
      sheets:  readRoomDB(id, 'sheets'),
      history: readRoomDB(id, 'history'),
      session: readRoomDB(id, 'session'),
      docs:    readRoomDB(id, 'docs'),
    };
  });
  res.json({ version: 2, exportedAt: new Date().toISOString(), users: readDB('users'), rooms, roomData });
});

app.post('/api/restore', authMiddleware, masterOnly, (req, res) => {
  const body = req.body;
  if (!body.users) return res.status(400).json({ error: 'Backup incompleto — falta campo users' });

  writeDB('users', body.users);

  // ── v2 backup (has rooms + roomData) ──
  if (body.rooms && body.roomData) {
    writeDB('rooms', body.rooms);
    Object.entries(body.roomData).forEach(([id, data]) => {
      if (data.sheets)  writeRoomDB(id, 'sheets',  data.sheets);
      if (data.history) writeRoomDB(id, 'history', data.history);
      if (data.session) writeRoomDB(id, 'session', data.session);
      if (data.docs)    writeRoomDB(id, 'docs',    data.docs);
    });

  // ── v1 backup (legacy: sheets/history/sessions at root) ──
  } else if (body.sheets || body.history || body.sessions) {
    // Migrate everything to the 'herois' room
    if (body.sheets)   writeRoomDB('herois', 'sheets',  body.sheets);
    if (body.history)  writeRoomDB('herois', 'history', body.history);
    if (body.sessions) writeRoomDB('herois', 'session', body.sessions);
    // Ensure default rooms exist
    initDefaultRooms();
  } else {
    return res.status(400).json({ error: 'Formato de backup não reconhecido' });
  }

  io.emit('server_restored');
  res.json({ ok: true, restoredAt: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════════
// SOCKET.IO
// ══════════════════════════════════════════════════════════════════
const onlineUsers = new Map(); // socketId -> { username, displayName, role, roomId }

function emitUsersStatus(roomId) {
  const roomUsers = Array.from(onlineUsers.values()).filter(u => u.roomId === roomId);
  io.to(`room:${roomId}`).emit('users_online', roomUsers);
  const users = readDB('users');
  const onlineUsernames = new Set(roomUsers.map(u => u.username));
  const statusList = Object.values(users).map(u => ({
    username: u.username,
    displayName: getAuthorLabel(u.username, u.displayName, roomId),
    role: u.role,
    online: onlineUsernames.has(u.username)
  }));
  io.to(`room:${roomId}`).emit('users_status', statusList);
}

function saveAndBroadcast(roomId, msg) {
  const history = readRoomDB(roomId, 'history');
  history[msg.id] = msg;
  writeRoomDB(roomId, 'history', history);
  io.to(`room:${roomId}`).emit('message', msg);
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Token ausente'));
  try { socket.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { next(new Error('Token inválido')); }
});

io.on('connection', (socket) => {
  const user = socket.user;
  const roomId = socket.handshake.auth.roomId;

  if (!roomId) {
    // Lobby connection — just for room online counts
    socket.join('lobby');
    socket.on('disconnect', () => {
      io.to('lobby').emit('rooms_updated');
    });
    return;
  }

  // Validate room exists
  const rooms = readDB('rooms');
  if (!rooms[roomId]) { socket.emit('error', 'Sala não encontrada'); socket.disconnect(); return; }

  socket.join(`room:${roomId}`);
  const authorLabel = getAuthorLabel(user.username, user.displayName, roomId);
  onlineUsers.set(socket.id, { username: user.username, displayName: authorLabel, role: user.role, roomId });
  emitUsersStatus(roomId);

  // Send history
  const history = readRoomDB(roomId, 'history');
  const recent = Object.values(history).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-100);
  socket.emit('history_load', recent);

  // Send sheets
  socket.emit('sheets_load', Object.values(readRoomDB(roomId, 'sheets')));

  // Send session/intro
  const session = readRoomDB(roomId, 'session');
  socket.emit('session_updated', session);
  if (user.role !== 'master' && session.intro) socket.emit('show_intro', { text: session.intro });

  console.log(`✅ ${authorLabel} entrou em [${roomId}]`);

  socket.on('narrate', data => {
    if (user.role !== 'master') return;
    saveAndBroadcast(roomId, { id: uuidv4(), type: 'narrate', author: getAuthorLabel(user.username, user.displayName, roomId), username: user.username, content: data.content, timestamp: new Date().toISOString() });
  });

  socket.on('action', data => {
    saveAndBroadcast(roomId, { id: uuidv4(), type: 'action', author: getAuthorLabel(user.username, user.displayName, roomId), username: user.username, role: user.role, content: data.content, timestamp: new Date().toISOString() });
  });

  socket.on('roll', data => {
    const d1 = Math.floor(Math.random()*6)+1, d2 = Math.floor(Math.random()*6)+1;
    const attr = parseInt(data.attr)||0, attrName = data.attrName||'';
    const total = d1+d2+attr;
    saveAndBroadcast(roomId, { id: uuidv4(), type: 'roll', author: getAuthorLabel(user.username, user.displayName, roomId), username: user.username, d1, d2, attr, attrName, total, isCritical: d1===6&&d2===6, isFumble: d1===1&&d2===1, timestamp: new Date().toISOString() });
  });

  socket.on('roll_custom', data => {
    const qty = Math.min(parseInt(data.qty)||1, 20), faces = Math.min(parseInt(data.faces)||6, 1000), bonus = parseInt(data.bonus)||0, difficulty = parseInt(data.difficulty)||0;
    const rolls = Array.from({length: qty}, () => Math.floor(Math.random()*faces)+1);
    const total = rolls.reduce((a,b)=>a+b,0) + bonus;
    saveAndBroadcast(roomId, { id: uuidv4(), type: 'roll_custom', author: getAuthorLabel(user.username, user.displayName, roomId), username: user.username, qty, faces, bonus, rolls, total, difficulty, isCritical: qty===2&&faces===6&&rolls[0]===6&&rolls[1]===6, isFumble: qty===2&&faces===6&&rolls[0]===1&&rolls[1]===1, timestamp: new Date().toISOString() });
  });

  socket.on('difficulty_set', data => {
    if (user.role !== 'master') return;
    const session = readRoomDB(roomId, 'session');
    session.difficulty = data;
    writeRoomDB(roomId, 'session', session);
    io.to(`room:${roomId}`).emit('difficulty_set', data);
  });

  socket.on('chat', data => {
    io.to(`room:${roomId}`).emit('message', { id: uuidv4(), type: 'chat', author: getAuthorLabel(user.username, user.displayName, roomId), username: user.username, role: user.role, content: data.content, timestamp: new Date().toISOString() });
  });

  socket.on('image', data => {
    if (user.role !== 'master') return;
    if (!data.src || (data.src.startsWith('data:') && data.src.length > 5*1024*1024)) return;
    saveAndBroadcast(roomId, { id: uuidv4(), type: 'image', author: getAuthorLabel(user.username, user.displayName, roomId), username: user.username, src: data.src, caption: (data.caption||'').slice(0,200), timestamp: new Date().toISOString() });
  });

  socket.on('audio', data => {
    if (!data.src || data.src.length > 4*1024*1024) return;
    saveAndBroadcast(roomId, { id: uuidv4(), type: 'audio', author: getAuthorLabel(user.username, user.displayName, roomId), username: user.username, src: data.src, timestamp: new Date().toISOString() });
  });

  socket.on('update_stats', data => {
    const target = data.username;
    if (user.role !== 'master' && user.username !== target) return;
    const sheets = readRoomDB(roomId, 'sheets');
    if (!sheets[target]) return;
    sheets[target] = { ...sheets[target], ...data.stats, updatedAt: new Date().toISOString() };
    writeRoomDB(roomId, 'sheets', sheets);
    io.to(`room:${roomId}`).emit('sheet_updated', { username: target, sheet: sheets[target] });
    emitUsersStatus(roomId);
  });

  socket.on('clear_log', () => {
    if (user.role !== 'master') return;
    writeRoomDB(roomId, 'history', {});
    io.to(`room:${roomId}`).emit('log_cleared', { by: getAuthorLabel(user.username, user.displayName, roomId) });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    emitUsersStatus(roomId);
    io.to('lobby').emit('rooms_updated');
    console.log(`❌ ${user.displayName} saiu de [${roomId}]`);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎮 Plataforma Heróis Improváveis`);
  console.log(`🌐 http://localhost:${PORT}\n`);
});
