// server.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const { requireAuthPage, verifySocketToken } = require('./lib/auth');
const shellEngine = require('./lib/shellEngine');
const systemStats = require('./lib/systemStats');

const authRoutes = require('./routes/auth');
const deployRoutes = require('./routes/deploy');
const fileRoutes = require('./routes/files');
const aiRoutes = require('./routes/ai');
const pairingRoutes = require('./routes/pairing');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/deploy', deployRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/pairing', pairingRoutes);

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.get('/landing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/', requireAuthPage, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/dashboard', requireAuthPage, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie || '';
  const match = cookieHeader.match(/cyberx_token=([^;]+)/);
  if (!match) return next(new Error('Unauthorized'));
  const decoded = verifySocketToken(match[1]);
  if (!decoded) return next(new Error('Unauthorized'));
  socket.user = decoded;
  next();
});

io.on('connection', (socket) => {
  const userId = socket.user.userId;
  socket.join(`user_${userId}`);

  console.log(`[CYBER X] ${socket.user.username} connected (${socket.id})`);

  const statsInterval = setInterval(async () => {
    try {
      const snapshot = await systemStats.getSnapshot();
      socket.emit('stats:update', snapshot);
    } catch (e) {}
  }, 2000);

  socket.on('terminal:run', async (command) => {
    await shellEngine.runCommand(userId, command, (chunk, type) => {
      socket.emit('terminal:output', { chunk, type });
    }).then((result) => {
      socket.emit('terminal:done', {
        exitCode: result.exitCode,
        cwd: shellEngine.getCurrentPathDisplay(userId),
        clear: result.clear || false
      });
    });
  });

  socket.on('terminal:cwd', () => {
    socket.emit('terminal:cwdUpdate', { cwd: shellEngine.getCurrentPathDisplay(userId) });
  });

  socket.on('disconnect', () => {
    clearInterval(statsInterval);
    console.log(`[CYBER X] ${socket.user.username} disconnected`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║      CYBER X CLOUD is online (real)       ║
  ║      http://localhost:${PORT}                ║
  ╚══════════════════════════════════════════╝
  `);
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 20) {
    console.warn('[CYBER X] WARNING: Set a real long JWT_SECRET in .env before going live.');
  }
  if (!process.env.GROQ_API_KEY) {
    console.warn('[CYBER X] WARNING: GROQ_API_KEY not set — Shivan AI will not work until you add it.');
  }
});
