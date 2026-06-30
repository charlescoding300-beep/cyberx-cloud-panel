// routes/deploy.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth');
const deployEngine = require('../lib/deployEngine');
const pm2Manager = require('../lib/pm2Manager');
const db = require('../lib/db');

router.post('/github', requireAuth, async (req, res) => {
  const { repoUrl, appName, branch } = req.body;
  if (!repoUrl || !appName) {
    return res.status(400).json({ ok: false, error: 'repoUrl and appName required' });
  }

  const io = req.app.get('io');
  const room = `user_${req.user.userId}`;

  res.json({ ok: true, message: 'Deploy started — watch live logs' });

  const onLog = (text, type) => {
    io.to(room).emit('deploy:log', { text, type });
  };

  const result = await deployEngine.deployFromGitHub(req.user.userId, {
    repoUrl,
    appName,
    branch: branch || 'main'
  }, onLog);

  db.prepare(`
    INSERT INTO deployments (user_id, name, repo_url, pm2_name, status, created_at, last_deployed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.userId,
    appName,
    repoUrl,
    `u${req.user.userId}_${appName}`,
    result.ok ? 'online' : 'failed',
    Date.now(),
    Date.now()
  );

  io.to(room).emit('deploy:complete', result);
});

router.get('/apps', requireAuth, async (req, res) => {
  const result = await pm2Manager.listApps(req.user.userId);
  res.json(result);
});

router.post('/apps/:name/:action', requireAuth, async (req, res) => {
  const result = await pm2Manager.controlApp(req.user.userId, req.params.name, req.params.action);
  res.json(result);
});

router.get('/apps/:name/logs', requireAuth, async (req, res) => {
  const result = await pm2Manager.getLogs(req.user.userId, req.params.name, req.query.lines);
  res.json(result);
});

module.exports = router;
