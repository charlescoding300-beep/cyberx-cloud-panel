// lib/shellEngine.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const users = require('./users');

const userSessionState = new Map();

function getRoot(userId) {
  const workspace = users.getUserWorkspace(userId);
  if (!workspace) throw new Error('No workspace found for user');
  return path.resolve(workspace);
}

function getState(userId) {
  if (!userSessionState.has(userId)) {
    userSessionState.set(userId, { cwd: getRoot(userId), activeProcs: 0 });
  }
  return userSessionState.get(userId);
}

function resolveWithinRoot(userId, inputPath) {
  const root = getRoot(userId);
  const state = getState(userId);
  const target = path.resolve(state.cwd, inputPath || '.');
  if (!target.startsWith(root)) {
    return null;
  }
  return target;
}

function loadUserEnv(userId) {
  const root = getRoot(userId);
  const envPath = path.join(root, '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    });
  }
  return env;
}

const MAX_CONCURRENT_PER_USER = 4;
const MAX_OUTPUT_BYTES = 512 * 1024;
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

function runCommand(userId, rawCommand, onData) {
  return new Promise((resolve) => {
    const trimmed = (rawCommand || '').trim();
    if (!trimmed) {
      resolve({ ok: true, exitCode: 0 });
      return;
    }

    const state = getState(userId);

    if (trimmed === 'cd' || trimmed.startsWith('cd ')) {
      const target = trimmed === 'cd' ? '~' : trimmed.slice(3).trim();
      const root = getRoot(userId);
      const resolved = target === '~' ? root : resolveWithinRoot(userId, target);
      if (!resolved) {
        onData('cd: permission denied — cannot leave your workspace\n', 'err');
        resolve({ ok: false, exitCode: 1 });
        return;
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        onData(`cd: no such directory: ${target}\n`, 'err');
        resolve({ ok: false, exitCode: 1 });
        return;
      }
      state.cwd = resolved;
      resolve({ ok: true, exitCode: 0 });
      return;
    }

    if (trimmed === 'pwd') {
      const root = getRoot(userId);
      const rel = path.relative(root, state.cwd);
      onData('/' + (rel || ''), 'out');
      resolve({ ok: true, exitCode: 0 });
      return;
    }

    if (trimmed === 'clear') {
      resolve({ ok: true, exitCode: 0, clear: true });
      return;
    }

    if (state.activeProcs >= MAX_CONCURRENT_PER_USER) {
      onData('too many commands running at once — wait for one to finish\n', 'err');
      resolve({ ok: false, exitCode: 1 });
      return;
    }

    const env = {
      PATH: process.env.PATH,
      HOME: state.cwd,
      USER: 'user',
      LANG: 'en_US.UTF-8',
      TERM: 'xterm-256color',
      ...loadUserEnv(userId)
    };

    state.activeProcs++;
    let outputBytes = 0;
    let truncated = false;

    const child = spawn(trimmed, {
      shell: true,
      cwd: state.cwd,
      env,
      timeout: COMMAND_TIMEOUT_MS
    });

    child.stdout.on('data', (chunk) => {
      if (truncated) return;
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        truncated = true;
        onData('\n[output truncated — exceeded size limit]\n', 'err');
        child.kill();
        return;
      }
      onData(chunk.toString(), 'out');
    });

    child.stderr.on('data', (chunk) => {
      if (truncated) return;
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        truncated = true;
        onData('\n[output truncated — exceeded size limit]\n', 'err');
        child.kill();
        return;
      }
      onData(chunk.toString(), 'err');
    });

    child.on('close', (code) => {
      state.activeProcs--;
      resolve({ ok: code === 0, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      state.activeProcs--;
      onData(`exec error: ${err.message}\n`, 'err');
      resolve({ ok: false, exitCode: 1 });
    });
  });
}

function getCurrentPathDisplay(userId) {
  const root = getRoot(userId);
  const state = getState(userId);
  const rel = path.relative(root, state.cwd);
  return '~' + (rel ? '/' + rel : '');
}

function resetSession(userId) {
  userSessionState.delete(userId);
}

module.exports = { runCommand, getCurrentPathDisplay, resetSession, loadUserEnv, getRoot };
