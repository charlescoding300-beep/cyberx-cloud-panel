// routes/ai.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth');
const shivanAI = require('../lib/shivanAI');

router.post('/chat', requireAuth, async (req, res) => {
  const { message, appName, filePath, includeLogs } = req.body;
  if (!message) return res.status(400).json({ ok: false, error: 'message required' });
  try {
    const reply = await shivanAI.chat(req.user.userId, message, { appName, filePath, includeLogs });
    res.json({ ok: true, reply });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/welcome', requireAuth, async (req, res) => {
  try {
    const message = await shivanAI.getWelcomeMessage(req.user.userId);
    res.json({ ok: true, message });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/apply-fix', requireAuth, (req, res) => {
  const { filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ ok: false, error: 'filePath and content required' });
  }
  const result = shivanAI.applyFix(req.user.userId, filePath, content);
  res.json(result);
});

module.exports = router;
