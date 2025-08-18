// src/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const router = express.Router();

const USERS = new Map([['demo@example.com', { id: 1, email: 'demo@example.com', pass: 'demo1234', roles: ['user'] }]]);

function signAT(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET || 'dev_access', { expiresIn: '15m' });
}
function signRT(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'dev_refresh', { expiresIn: '30d' });
}
function setRTC(res, token) {
  res.cookie('rt', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/auth', maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  if (!tok) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(tok, process.env.JWT_ACCESS_SECRET || 'dev_access');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid/expired token' });
  }
}
function requireRole(role) {
  return (req, res, next) => req.user?.roles?.includes(role) ? next() : res.status(403).json({ error: 'Forbidden' });
}

router.use(cookieParser());

router.post('/login', express.json(), (req, res) => {
  const { email, password } = req.body || {};
  const u = USERS.get(email);
  if (!u || u.pass !== password) return res.status(401).json({ error: 'Invalid credentials' });
  const payload = { sub: String(u.id), email: u.email, roles: u.roles, rv: 0 };
  const at = signAT(payload);
  const rt = signRT(payload);
  setRTC(res, rt);
  res.json({ accessToken: at, user: { id: u.id, email: u.email, roles: u.roles } });
});

router.post('/refresh', (req, res) => {
  const rt = req.cookies?.rt;
  if (!rt) return res.status(401).json({ error: 'No refresh token' });
  try {
    const d = jwt.verify(rt, process.env.JWT_REFRESH_SECRET || 'dev_refresh');
    const at = signAT({ sub: d.sub, email: d.email, roles: d.roles, rv: d.rv });
    setRTC(res, signRT(d));
    res.json({ accessToken: at });
  } catch { res.status(401).json({ error: 'Invalid refresh token' }); }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('rt', { path: '/auth' });
  res.json({ ok: true });
});

module.exports = { authRouter: router, requireAuth, requireRole };
