// routes/deploy.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth');
const deployEngine = require('../lib/deployEngine');
const pm2Manager = require('../lib/pm2Manager');
const db = require('../lib/db');
const errorDetector = require('../lib/errorDetector');
const shivanAI = require('../lib/shivanAI');

router.post('/github', requireAuth, async (req, res) => {
  const { repoUrl, appName, branch } = req.body;
  if (!repoUrl || !appName) {
    return res.status(400).json({ ok: false, error: 'repoUrl and appName required' });
  }

  const io = req.app.get('io');
  const room = `user_${req.user.userId}`;

  res.json({ ok: true, message: 'Deploy started — watch live logs' });

  let errorAlreadyFlagged = false;
  const onLog = (text, type) => {
    io.to(room).emit('deploy:log', { text, type });

    if (!errorAlreadyFlagged && type === 'err') {
      const match = errorDetector.detectError(text);
      if (match) {
        errorAlreadyFlagged = true;
        io.to(room).emit('shivan:analyzing', { label: match.label });
        shivanAI.chat(
          req.user.userId,
          `A deployment just failed with this error: "${match.matchedLine}" (category: ${match.label}). Look at the workspace context you've been given and diagnose the real cause. Then propose a specific fix — say which file needs to change and what the corrected content should be. End your response with exactly one line: "PROPOSED_FIX: <filename>" naming the single most likely file to fix, or "PROPOSED_FIX: none" if you can't identify one.`,
          { includeLogs: false }
        ).then((diagnosis) => {
          io.to(room).emit('shivan:diagnosis', {
            label: match.label,
            matchedLine: match.matchedLine,
            diagnosis
          });
        }).catch((e) => {
          io.to(room).emit('shivan:diagnosis', {
            label: match.label,
            matchedLine: match.matchedLine,
            diagnosis: 'Shivan could not analyze this — ' + e.message
          });
        });
      }
    }
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

router.post('/apps/all/:action', requireAuth, async (req, res) => {
  const result = await pm2Manager.controlAllApps(req.user.userId, req.params.action);
  res.json(result);
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
