const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3002;
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const dbFile = path.join(dataDir, 'db.json');
const defaultDb = {
  users: [{ id: 'admin', name: 'Administrador', username: 'admin', password: 'Gilma@123', photo: null, role: 'admin' }],
  messages: [],
  groups: []
};
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify(defaultDb, null, 2));

const readDb = () => JSON.parse(fs.readFileSync(dbFile, 'utf8'));
const writeDb = db => fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
const safeUser = user => { const { password, ...withoutPassword } = user; return withoutPassword; };

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.post('/api/register', upload.single('photo'), (req, res) => {
  try {
    const db = readDb();
    let { name, username, password } = req.body;
    username = String(username || '').toLowerCase().trim();
    name = String(name || '').trim();
    password = String(password || '');

    if (!name || !username || !password || !req.file) {
      return res.status(400).json({ error: 'Preencha todos os campos e envie uma foto de perfil.' });
    }
    if (db.users.some(u => u.username === username)) {
      return res.status(400).json({ error: 'Nome de utilizador já existe.' });
    }

    const user = {
      id: Date.now().toString(),
      name,
      username,
      password,
      photo: `/uploads/${req.file.filename}`,
      role: 'user'
    };
    db.users.push(user);
    writeDb(db);
    res.json({ user: safeUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível criar a conta.' });
  }
});

app.post('/api/login', (req, res) => {
  const db = readDb();
  const username = String(req.body.username || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Dados de login incorretos.' });
  res.json({ user: safeUser(user) });
});

app.get('/api/users', (req, res) => {
  res.json(readDb().users.map(safeUser));
});

app.get('/api/messages', (req, res) => {
  res.json(readDb().messages);
});

app.post('/api/messages', upload.single('file'), (req, res) => {
  try {
    const db = readDb();
    const from = String(req.body.from || '');
    const to = String(req.body.to || '');
    const groupId = String(req.body.groupId || '');
    const text = String(req.body.text || '').trim();

    if (!from || (!to && !groupId) || (!text && !req.file)) {
      return res.status(400).json({ error: 'Mensagem vazia ou destino inválido.' });
    }

    const type = req.file?.mimetype?.startsWith('video/') ? 'video'
      : req.file?.mimetype?.startsWith('image/') ? 'image'
      : req.file ? 'file' : null;

    const message = {
      id: Date.now().toString(),
      from,
      to: to || null,
      groupId: groupId || null,
      text,
      file: req.file ? `/uploads/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null,
      fileType: type,
      time: new Date().toISOString()
    };

    if (groupId) {
      const group = db.groups.find(g => g.id === groupId);
      if (!group) return res.status(404).json({ error: 'Grupo não encontrado.' });
      if (!group.members.includes(from)) return res.status(403).json({ error: 'Não és membro deste grupo.' });
    } else if (!db.users.some(u => u.id === to)) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    db.messages.push(message);
    writeDb(db);
    res.json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
});

app.get('/api/groups', (req, res) => {
  const db = readDb();
  res.json(db.groups.map(g => ({
    ...g,
    memberUsers: g.members.map(id => db.users.find(u => u.id === id)).filter(Boolean).map(safeUser)
  })));
});

app.post('/api/groups', (req, res) => {
  const db = readDb();
  const name = String(req.body.name || '').trim();
  const creator = String(req.body.creator || '');
  let members = Array.isArray(req.body.members) ? req.body.members.map(String) : [];
  if (!name || !creator) return res.status(400).json({ error: 'Nome e criador são obrigatórios.' });
  if (!db.users.some(u => u.id === creator)) return res.status(400).json({ error: 'Criador inválido.' });
  members = [...new Set([creator, ...members])].filter(id => db.users.some(u => u.id === id));

  const group = {
    id: Date.now().toString(),
    name,
    creator,
    members,
    created: new Date().toISOString()
  };
  db.groups.push(group);
  writeDb(db);
  res.json(group);
});

app.post('/api/groups/:id/members', (req, res) => {
  const db = readDb();
  const group = db.groups.find(g => g.id === req.params.id);
  const userId = String(req.body.userId || '');
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado.' });
  if (!db.users.some(u => u.id === userId)) return res.status(404).json({ error: 'Utilizador não encontrado.' });
  if (!group.members.includes(userId)) group.members.push(userId);
  writeDb(db);
  res.json(group);
});

app.get('/api/admin/stats', (req, res) => {
  const db = readDb();
  res.json({
    users: db.users.length,
    groups: db.groups.length,
    messages: db.messages.length,
    media: db.messages.filter(m => m.file).length,
    online: Math.max(1, Math.min(db.users.length, 3))
  });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'O ficheiro é demasiado grande. O limite é 50 MB.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Ocorreu um erro no servidor.' });
});

app.listen(PORT, () => console.log(`GilmaConversa aberto em http://localhost:${PORT}`));

