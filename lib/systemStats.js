// lib/systemStats.js
const os = require('os');
const si = require('systeminformation');

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

async function getCpuPercent() {
  try {
    const load = await si.currentLoad();
    if (load && typeof load.currentLoad === 'number' && !isNaN(load.currentLoad)) {
      return Math.round(load.currentLoad);
    }
  } catch (e) {}
  const cores = os.cpus().length || 1;
  return Math.min(100, Math.round((os.loadavg()[0] / cores) * 100));
}

function getMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    percent: total > 0 ? Math.round((used / total) * 100) : 0
  };
}

async function getSnapshot() {
  const cpuPercent = await getCpuPercent();
  return {
    cpu: { percent: cpuPercent, cores: os.cpus().length },
    memory: getMemory(),
    uptime: { seconds: os.uptime(), formatted: formatUptime(os.uptime()) },
    hostname: os.hostname()
  };
}

module.exports = { getSnapshot, formatUptime };
