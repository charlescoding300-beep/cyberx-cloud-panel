// routes/auth.js
const express = require('express');
const router = express.Router();
const users = require('../lib/users');
const { issueToken } = require('../lib/auth');

router.post('/signup', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password required' });
  }
  const result = users.createUser(username, password);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  const user = users.getUserById(result.userId);
  const token = issueToken(user);
  setCookie(res, token);
  res.json({ ok: true, username: user.username });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Username and password required' });
  }
  const result = users.verifyUser(username, password);
  if (!result.ok) {
    return res.status(401).json({ ok: false, error: result.error });
  }
  const token = issueToken(result.user);
  setCookie(res, token);
  res.json({ ok: true, username: result.user.username });
});

router.post('/logout', (req, res) => {
  res.clearCookie('cyberx_token');
  res.json({ ok: true });
});

function setCookie(res, token) {
  const expiryHours = parseInt(process.env.SESSION_EXPIRY_HOURS || '168', 10);
  res.cookie('cyberx_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: expiryHours * 60 * 60 * 1000
  });
}

module.exports = router;
