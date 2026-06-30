// routes/pairing.js
const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const users = require('../lib/users');

router.post('/linked', (req, res) => {
  const { phone } = req.body;
  const masked = phone ? phone.slice(0, 4) + '***' + phone.slice(-3) : 'unknown';
  db.prepare('INSERT INTO pairing_log (phone_masked, linked_at) VALUES (?, ?)').run(masked, Date.now());
  const count = db.prepare('SELECT COUNT(*) as c FROM pairing_log').get().c;
  req.app.get('io')?.emit('pairing:update', { count });
  res.json({ ok: true, count });
});

router.get('/count', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM pairing_log').get().c;
  res.json({ ok: true, count });
});

router.get('/activity', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM pairing_log ORDER BY linked_at DESC LIMIT 20').all();
  res.json({ ok: true, activity: rows });
});

router.get('/stats', requireAuth, (req, res) => {
  res.json({ ok: true, totalUsers: users.countUsers() });
});

module.exports = router;
