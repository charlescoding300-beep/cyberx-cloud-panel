// lib/pm2Manager.js
const pm2 = require('pm2');

function withPm2(fn) {
  return new Promise((resolve, reject) => {
    pm2.connect((err) => {
      if (err) return reject(err);
      fn((result) => {
        pm2.disconnect();
        resolve(result);
      }, (err) => {
        pm2.disconnect();
        reject(err);
      });
    });
  });
}

function prefixFor(userId) {
  return `u${userId}_`;
}

function namespacedName(userId, name) {
  const safe = String(name).replace(/[^a-zA-Z0-9_-]/g, '');
  return `${prefixFor(userId)}${safe}`;
}

async function startApp(userId, { name, script, cwd, maxMemoryMb = 256 }) {
  const fullName = namespacedName(userId, name);
  return withPm2((resolve, reject) => {
    pm2.start({
      name: fullName,
      script,
      cwd,
      max_memory_restart: `${maxMemoryMb}M`,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: 'production' }
    }, (err, proc) => {
      if (err) return reject(err);
      resolve({ ok: true, name: fullName });
    });
  }).catch((e) => ({ ok: false, error: e.message }));
}

async function listApps(userId) {
  const prefix = prefixFor(userId);
  return withPm2((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) return reject(err);
      const mine = list
        .filter((p) => p.name.startsWith(prefix))
        .map((p) => ({
          name: p.name.replace(prefix, ''),
          fullName: p.name,
          pid: p.pid,
          status: p.pm2_env?.status || 'unknown',
          cpu: p.monit?.cpu ?? 0,
          memory: p.monit?.memory ?? 0,
          restarts: p.pm2_env?.restart_time ?? 0,
          uptime: p.pm2_env?.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0
        }));
      resolve({ ok: true, apps: mine });
    });
  }).catch((e) => ({ ok: false, error: e.message, apps: [] }));
}

function assertOwned(userId, name) {
  const prefix = prefixFor(userId);
  const full = namespacedName(userId, name);
  if (!full.startsWith(prefix)) {
    throw new Error('not your process');
  }
  return full;
}

async function controlApp(userId, name, action) {
  const fullName = assertOwned(userId, name);
  const validActions = ['restart', 'stop', 'start', 'delete', 'reload'];
  if (!validActions.includes(action)) {
    return { ok: false, error: 'invalid action' };
  }
  return withPm2((resolve, reject) => {
    pm2[action](fullName, (err) => {
      if (err) return reject(err);
      resolve({ ok: true });
    });
  }).catch((e) => ({ ok: false, error: e.message }));
}

async function getLogs(userId, name, lines = 60) {
  const fullName = assertOwned(userId, name);
  return withPm2((resolve, reject) => {
    pm2.describe(fullName, (err, desc) => {
      if (err) return reject(err);
      if (!desc || !desc.length) return resolve({ ok: false, error: 'process not found' });
      const fs = require('fs');
      const outPath = desc[0].pm2_env.pm_out_log_path;
      const errPath = desc[0].pm2_env.pm_err_log_path;
      let output = '';
      try {
        const out = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
        const errOut = fs.existsSync(errPath) ? fs.readFileSync(errPath, 'utf8') : '';
        const combined = (out + '\n' + errOut).split('\n').filter(Boolean);
        output = combined.slice(-lines).join('\n');
      } catch (e) {
        output = '(could not read log files)';
      }
      resolve({ ok: true, output });
    });
  }).catch((e) => ({ ok: false, error: e.message }));
}

module.exports = { startApp, listApps, controlApp, getLogs, namespacedName };
