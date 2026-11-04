const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USERNAME = 'AzumoAurora3032';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const DB_FILE = path.resolve(process.env.DATABASE_FILE || './data/azumofuyuki.sqlite');

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.startsWith('replace-')) throw new Error('Set a strong ADMIN_PASSWORD in your environment.');
if (!SESSION_SECRET || SESSION_SECRET.length < 32 || SESSION_SECRET.startsWith('replace-')) throw new Error('Set SESSION_SECRET to a random value of at least 32 characters.');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, approved_at TEXT
);
CREATE TABLE IF NOT EXISTS applications (
 id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, verification_code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT, reviewed_by TEXT
);
CREATE TABLE IF NOT EXISTS channels (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER NOT NULL REFERENCES channels(id),
 user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS messages_channel_id_id ON messages(channel_id, id);
`);
for (const [name, description] of [['general','みんなの雑談'],['announcements','サーバーからのお知らせ'],['minecraft','Minecraftの話題']]) {
 db.prepare('INSERT OR IGNORE INTO channels(name, description) VALUES (?, ?)').run(name, description);
}
const adminKey = ADMIN_USERNAME.toLowerCase();
const admin = db.prepare('SELECT id FROM users WHERE username_key = ?').get(adminKey);
if (!admin) {
 db.prepare('INSERT INTO users(username, username_key, password_hash, role, status, approved_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)')
   .run(ADMIN_USERNAME, adminKey, bcrypt.hashSync(ADMIN_PASSWORD, 12), 'admin', 'approved');
} else {
 db.prepare("UPDATE users SET username = ?, role = 'admin', status = 'approved' WHERE username_key = ?").run(ADMIN_USERNAME, adminKey);
}

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
const sessionMiddleware = session({
 store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.dirname(DB_FILE) }),
 secret: SESSION_SECRET, resave: false, saveUninitialized: false,
 cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });
const usernamePattern = /^[A-Za-z0-9_]{3,16}$/;
const normalize = value => String(value || '').trim();
const safeUser = user => ({ id: user.id, username: user.username, role: user.role });
function currentUser(req) {
 if (!req.session.userId) return null;
 return db.prepare("SELECT id, username, role, status FROM users WHERE id = ? AND status = 'approved'").get(req.session.userId) || null;
}
function requireAuth(req, res, next) {
 const user = currentUser(req);
 if (!user) return res.status(401).json({ error: 'ログインが必要です。' });
 req.user = user; next();
}
function requireAdmin(req, res, next) {
 if (req.user.role !== 'admin' || req.user.username !== ADMIN_USERNAME) return res.status(403).json({ error: '管理者のみ利用できます。' });
 next();
}
app.use('/api', (req, res, next) => {
 if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
  const origin = req.get('origin');
  if (origin && origin !== (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`)) return res.status(403).json({ error: '不正なアクセス元です。' });
 }
 next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'azumofuyuki-chat' }));
app.get('/api/me', (req, res) => {
 const user = currentUser(req);
 res.json({ user: user ? safeUser(user) : null });
});
app.post('/api/apply', authLimiter, async (req, res) => {
 const username = normalize(req.body.username);
 const password = String(req.body.password || '');
 const usernameKey = username.toLowerCase();
 if (!usernamePattern.test(username)) return res.status(400).json({ error: 'Minecraft Java版のユーザー名（英数字と_、3〜16文字）を入力してください。' });
 if (password.length < 10 || password.length > 128) return res.status(400).json({ error: 'パスワードは10〜128文字にしてください。' });
 if (usernameKey === adminKey) return res.status(409).json({ error: 'このユーザー名は管理者専用です。' });
 if (db.prepare('SELECT id FROM users WHERE username_key = ?').get(usernameKey) || db.prepare("SELECT id FROM applications WHERE username_key = ? AND status IN ('pending','approved')").get(usernameKey))
  return res.status(409).json({ error: 'このMinecraftユーザー名は既に登録済み、または申請中です。' });
 const code = crypto.randomBytes(3).toString('hex').toUpperCase();
 const hash = await bcrypt.hash(password, 12);
 db.prepare("DELETE FROM applications WHERE username_key = ? AND status = 'rejected'").run(usernameKey);
 try {
  db.prepare('INSERT INTO applications(username, username_key, password_hash, verification_code) VALUES (?, ?, ?, ?)').run(username, usernameKey, hash, code);
 } catch { return res.status(409).json({ error: 'このユーザー名は既に申請されています。' }); }
 res.status(201).json({ message: '申請を受け付けました。', code, instruction: `Minecraftサーバー内で「${code}」と発言し、管理者に確認してもらってください。確認後、管理者が承認するとログインできます。` });
});
app.post('/api/login', authLimiter, async (req, res) => {
 const username = normalize(req.body.username);
 const password = String(req.body.password || '');
 const user = db.prepare("SELECT * FROM users WHERE username_key = ? AND status = 'approved'").get(username.toLowerCase());
 if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'ユーザー名またはパスワードが違うか、まだ承認されていません。' });
 req.session.regenerate(err => {
  if (err) return res.status(500).json({ error: 'ログインに失敗しました。' });
  req.session.userId = user.id;
  res.json({ user: safeUser(user) });
 });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/channels', requireAuth, (req, res) => res.json({ channels: db.prepare('SELECT id, name, description FROM channels ORDER BY id').all() }));
app.get('/api/messages/:channelId', requireAuth, (req, res) => {
 const channelId = Number(req.params.channelId);
 if (!db.prepare('SELECT id FROM channels WHERE id = ?').get(channelId)) return res.status(404).json({ error: 'チャンネルがありません。' });
 const messages = db.prepare(`SELECT m.id, m.body, m.created_at, u.username, u.role FROM messages m JOIN users u ON u.id = m.user_id WHERE m.channel_id = ? ORDER BY m.id DESC LIMIT 100`).all(channelId).reverse();
 res.json({ messages });
});
app.post('/api/admin/channels', requireAuth, requireAdmin, (req, res) => {
 const name = normalize(req.body.name).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
 const description = normalize(req.body.description).slice(0, 100);
 if (name.length < 2) return res.status(400).json({ error: 'チャンネル名は2文字以上必要です。' });
 try { const info = db.prepare('INSERT INTO channels(name, description) VALUES (?, ?)').run(name, description); res.status(201).json({ id: Number(info.lastInsertRowid), name, description }); }
 catch { res.status(409).json({ error: '同じ名前のチャンネルが既にあります。' }); }
});
app.get('/api/admin/applications', requireAuth, requireAdmin, (req, res) => {
 res.json({ applications: db.prepare("SELECT id, username, verification_code, status, created_at FROM applications WHERE status = 'pending' ORDER BY id").all() });
});
app.post('/api/admin/applications/:id/approve', requireAuth, requireAdmin, (req, res) => {
 const id = Number(req.params.id);
 const application = db.prepare("SELECT * FROM applications WHERE id = ? AND status = 'pending'").get(id);
 if (!application) return res.status(404).json({ error: '申請が見つかりません。' });
 if (application.username_key === adminKey) return res.status(403).json({ error: '管理者名は申請できません。' });
 const tx = db.transaction(() => {
  db.prepare("INSERT INTO users(username, username_key, password_hash, role, status, approved_at) VALUES (?, ?, ?, 'member', 'approved', CURRENT_TIMESTAMP)")
   .run(application.username, application.username_key, application.password_hash);
  db.prepare("UPDATE applications SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?").run(req.user.username, id);
 });
 try { tx(); } catch { return res.status(409).json({ error: '登録に失敗しました。ユーザー名が既に使用されている可能性があります。' }); }
 res.json({ ok: true });
});
app.post('/api/admin/applications/:id/reject', requireAuth, requireAdmin, (req, res) => {
 const info = db.prepare("UPDATE applications SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ? AND status = 'pending'").run(req.user.username, Number(req.params.id));
 if (!info.changes) return res.status(404).json({ error: '申請が見つかりません。' });
 res.json({ ok: true });
});
app.get('/api/admin/members', requireAuth, requireAdmin, (req, res) => {
 res.json({ members: db.prepare("SELECT id, username, role, created_at FROM users WHERE status = 'approved' ORDER BY role DESC, username COLLATE NOCASE").all() });
});
app.post('/api/admin/members/:id/ban', requireAuth, requireAdmin, (req, res) => {
 const id = Number(req.params.id);
 const target = db.prepare('SELECT username, role FROM users WHERE id = ?').get(id);
 if (!target || target.role === 'admin') return res.status(403).json({ error: 'このユーザーは停止できません。' });
 db.prepare("UPDATE users SET status = 'banned' WHERE id = ?").run(id);
 for (const socket of io.sockets.sockets.values()) if (socket.data.userId === id) socket.disconnect(true);
 res.json({ ok: true });
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

io.use((socket, next) => {
 const userId = socket.request.session?.userId;
 const user = userId && currentUser({ session: { userId } });
 if (!user) return next(new Error('ログインが必要です。'));
 socket.data.userId = user.id; socket.data.username = user.username; next();
});
io.on('connection', socket => {
 socket.on('join-channel', channelId => {
  const id = Number(channelId);
  if (db.prepare('SELECT id FROM channels WHERE id = ?').get(id)) {
   for (const room of socket.rooms) if (room.startsWith('channel:')) socket.leave(room);
   socket.join(`channel:${id}`);
  }
 });
 socket.on('send-message', payload => {
  const user = db.prepare("SELECT id, username, role FROM users WHERE id = ? AND status = 'approved'").get(socket.data.userId);
  const channelId = Number(payload?.channelId);
  const body = String(payload?.body || '').trim();
  if (!user || !body || body.length > 2000 || !db.prepare('SELECT id FROM channels WHERE id = ?').get(channelId)) return;
  const result = db.prepare('INSERT INTO messages(channel_id, user_id, body) VALUES (?, ?, ?)').run(channelId, user.id, body);
  const message = db.prepare('SELECT m.id, m.body, m.created_at, u.username, u.role FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(result.lastInsertRowid);
  io.to(`channel:${channelId}`).emit('new-message', message);
 });
});
server.listen(PORT, () => console.log(`Azumofuyuki Chat listening on :${PORT}`));
