// lib/oauth.js
const crypto = require('crypto');
const db = require('./db');
const users = require('./users');

function randomState() {
  return crypto.randomBytes(16).toString('hex');
}

function getGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeGoogleCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Google token exchange failed');
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` }
  });
  const profile = await profileRes.json();
  return { email: profile.email, name: profile.name, provider: 'google', providerId: profile.id };
}

function getGitHubAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_REDIRECT_URI,
    scope: 'read:user user:email',
    state
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

async function exchangeGitHubCode(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      redirect_uri: process.env.GITHUB_REDIRECT_URI
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('GitHub token exchange failed');
  const profileRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${data.access_token}`, 'User-Agent': 'CYBER-X-CLOUD' }
  });
  const profile = await profileRes.json();
  let email = profile.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${data.access_token}`, 'User-Agent': 'CYBER-X-CLOUD' }
    });
    const emails = await emailsRes.json();
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary) : null;
    email = primary ? primary.email : `${profile.login}@users.noreply.github.com`;
  }
  return { email, name: profile.login, provider: 'github', providerId: String(profile.id) };
}

function findOrCreateOAuthUser(profile) {
  const baseUsername = (profile.email.split('@')[0] + '_' + profile.provider)
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 20);
  let existing = db.prepare('SELECT * FROM users WHERE username = ?').get(baseUsername);
  if (existing) return existing;
  const randomPassword = crypto.randomBytes(24).toString('hex');
  const result = users.createUser(baseUsername, randomPassword);
  if (!result.ok) throw new Error('Failed to create OAuth user: ' + result.error);
  return users.getUserById(result.userId);
}

module.exports = { randomState, getGoogleAuthUrl, exchangeGoogleCode, getGitHubAuthUrl, exchangeGitHubCode, findOrCreateOAuthUser };
