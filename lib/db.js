// lib/db.js
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'cyberx.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL,
    workspace_dir TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    repo_url TEXT,
    pm2_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stopped',
    created_at INTEGER NOT NULL,
    last_deployed_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pairing_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    phone_masked TEXT,
    linked_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS build_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deployment_id INTEGER NOT NULL,
    log_line TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(deployment_id) REFERENCES deployments(id)
  );
`);

module.exports = db;
