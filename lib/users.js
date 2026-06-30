// lib/users.js
const db = require('./db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

function getWorkspaceRoot() {
  return path.resolve(process.env.WORKSPACE_ROOT || './workspace/users');
}

function createUser(username, password, role = 'user') {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return { ok: false, error: 'Username already taken' };
  }
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return { ok: false, error: 'Username must be 3-24 chars, letters/numbers/underscore only' };
  }
  if (!password || password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters' };
  }

  const hash = bcrypt.hashSync(password, 10);
  const now = Date.now();

  const workspaceDir = path.join(getWorkspaceRoot(), username);
  fs.mkdirSync(workspaceDir, { recursive: true });
  const envPath = path.join(workspaceDir, '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, '# Your environment variables — read at runtime by your bot\n');
  }

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role, created_at, workspace_dir)
    VALUES (?, ?, ?, ?, ?)
  `).run(username, hash, role, now, workspaceDir);

  return { ok: true, userId: result.lastInsertRowid, workspaceDir };
}

function verifyUser(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return { ok: false, error: 'Invalid username or password' };
  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) return { ok: false, error: 'Invalid username or password' };
  return { ok: true, user };
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserWorkspace(userId) {
  const user = getUserById(userId);
  if (!user) return null;
  return user.workspace_dir;
}

function countUsers() {
  return db.prepare('SELECT COUNT(*) as c FROM users').get().c;
}

module.exports = {
  createUser,
  verifyUser,
  getUserById,
  getUserByUsername,
  getUserWorkspace,
  getWorkspaceRoot,
  countUsers
};
