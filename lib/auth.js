// lib/auth.js
const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 20) {
    console.warn('[CYBER X] WARNING: JWT_SECRET missing or too short. Set a long random string in .env.');
  }
  return secret || 'insecure_dev_secret_replace_me';
}

function issueToken(user) {
  const expiryHours = parseInt(process.env.SESSION_EXPIRY_HOURS || '168', 10);
  return jwt.sign({ userId: user.id, username: user.username, role: user.role }, getJwtSecret(), {
    expiresIn: `${expiryHours}h`
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.cyberx_token;
  if (!token) return res.status(401).json({ ok: false, error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, getJwtSecret());
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Session expired or invalid' });
  }
}

function requireAuthPage(req, res, next) {
  const token = req.cookies?.cyberx_token;
  if (!token) return res.redirect('/login');
  try {
    req.user = jwt.verify(token, getJwtSecret());
    next();
  } catch (e) {
    return res.redirect('/login');
  }
}

function verifySocketToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (e) {
    return null;
  }
}

module.exports = { issueToken, requireAuth, requireAuthPage, getJwtSecret, verifySocketToken };
