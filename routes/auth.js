// routes/auth.js
const express = require('express');
const router = express.Router();
const users = require('../lib/users');
const oauth = require('../lib/oauth');
const { issueToken } = require('../lib/auth');

router.post('/signup', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ ok: false, error: 'Username and password required' });
  const result = users.createUser(username, password);
  if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
  const user = users.getUserById(result.userId);
  const token = issueToken(user);
  setCookie(res, token);
  res.json({ ok: true, username: user.username });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ ok: false, error: 'Username and password required' });
  const result = users.verifyUser(username, password);
  if (!result.ok) return res.status(401).json({ ok: false, error: result.error });
  const token = issueToken(result.user);
  setCookie(res, token);
  res.json({ ok: true, username: result.user.username });
});

router.post('/logout', (req, res) => {
  res.clearCookie('cyberx_token');
  res.json({ ok: true });
});

router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(500).send('Google login is not configured yet.');
  const state = oauth.randomState();
  res.cookie('oauth_state', state, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  res.redirect(oauth.getGoogleAuthUrl(state));
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!state || state !== req.cookies.oauth_state) return res.status(400).send('Invalid OAuth state — please try logging in again.');
    const profile = await oauth.exchangeGoogleCode(code);
    const user = oauth.findOrCreateOAuthUser(profile);
    const token = issueToken(user);
    setCookie(res, token);
    res.clearCookie('oauth_state');
    res.redirect('/dashboard');
  } catch (e) {
    res.status(500).send('Google login failed: ' + e.message);
  }
});

router.get('/github', (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID) return res.status(500).send('GitHub login is not configured yet.');
  const state = oauth.randomState();
  res.cookie('oauth_state', state, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  res.redirect(oauth.getGitHubAuthUrl(state));
});

router.get('/github/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!state || state !== req.cookies.oauth_state) return res.status(400).send('Invalid OAuth state — please try logging in again.');
    const profile = await oauth.exchangeGitHubCode(code);
    const user = oauth.findOrCreateOAuthUser(profile);
    const token = issueToken(user);
    setCookie(res, token);
    res.clearCookie('oauth_state');
    res.redirect('/dashboard');
  } catch (e) {
    res.status(500).send('GitHub login failed: ' + e.message);
  }
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
