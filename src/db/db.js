// src/db.js
const { PrismaClient } = require('@prisma/client');
module.exports = new PrismaClient();

const express = require('express');
const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const cookieParser = require('cookie-parser');
const prisma = require('./db');

const router = express.Router();

function signAT(p) { return jwt.sign(p, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' }); }
function signRT(p) { return jwt.sign(p, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' }); }
function setRTC(res, token) {
  res.cookie('rt', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/auth', maxAge: 1000*60*60*24*30
  });
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t) return res.status(401).json({ error: 'Missing token' });
  try { req.user = jwt.verify(t, process.env.JWT_ACCESS_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid/expired token' }); }
}

router.use(cookieParser());

// Register
router.post('/register', express.json(), async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'Email taken' });

  const passHash = await argon2.hash(password);
  const user = await prisma.user.create({ data: { email, passHash } });
  res.status(201).json({ ok: true, id: user.id });
});

// Login
router.post('/login', express.json(), async (req, res) => {
  const { email, password } = req.body || {};
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await argon2.verify(user.passHash, password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const payload = { sub: String(user.id), email: user.email, roles: user.roles, rv: user.refreshVersion };
  const at = signAT(payload);
  const rt = signRT(payload);
  setRTC(res, rt);
  res.json({ accessToken: at, user: { id: user.id, email: user.email, roles: user.roles } });
});

// Refresh
router.post('/refresh', async (req, res) => {
  const rt = req.cookies?.rt;
  if (!rt) return res.status(401).json({ error: 'No refresh token' });
  try {
    const d = jwt.verify(rt, process.env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: Number(d.sub) } });
    if (!user || user.refreshVersion !== d.rv) return res.status(401).json({ error: 'Refresh invalidated' });
    const payload = { sub: String(user.id), email: user.email, roles: user.roles, rv: user.refreshVersion };
    const at = signAT(payload);
    setRTC(res, signRT(payload)); // rotate
    res.json({ accessToken: at });
  } catch { res.status(401).json({ error: 'Invalid refresh token' }); }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const rt = req.cookies?.rt;
    if (rt) {
      const d = jwt.verify(rt, process.env.JWT_REFRESH_SECRET);
      await prisma.user.update({ where: { id: Number(d.sub) }, data: { refreshVersion: { increment: 1 } } });
    }
  } catch {}
  res.clearCookie('rt', { path: '/auth' });
  res.json({ ok: true });
});

module.exports = { authRouter: router, requireAuth };
