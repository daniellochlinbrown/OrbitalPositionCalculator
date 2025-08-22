const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const router = express.Router();
router.use(cookieParser());

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'dev_access';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh';

const signAT = (p) => jwt.sign(p, ACCESS_SECRET,  { expiresIn: '15m' });
const signRT = (p) => jwt.sign(p, REFRESH_SECRET, { expiresIn: '30d' });
const setRTC = (res, token) => res.cookie('rt', token, {
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', path: '/auth', maxAge: 30*24*60*60*1000
});

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t) return res.status(401).json({ error: 'Missing token' });
  try { req.user = jwt.verify(t, ACCESS_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid/expired token' }); }
}

// Register
router.post('/register', express.json(), async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (password.length < 8)   return res.status(400).json({ error: 'password must be at least 8 chars' });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: 'email already registered' });

    const passHash = await argon2.hash(password);
    const user = await prisma.user.create({ data: { email, passHash, roles: 'user' } });

    const payload = { sub: String(user.id), email: user.email, roles: user.roles, rv: user.refreshVersion };
    setRTC(res, signRT(payload));
    return res.status(201).json({ accessToken: signAT(payload), user: { id: user.id, email: user.email, roles: user.roles } });
  } catch (e) {
    console.error('[register] err', e);
    return res.status(500).json({ error: 'internal error' });
  }
});

// Login (DB)
router.post('/login', express.json(), async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await argon2.verify(user.passHash, password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const payload = { sub: String(user.id), email: user.email, roles: user.roles, rv: user.refreshVersion };
  setRTC(res, signRT(payload));
  res.json({ accessToken: signAT(payload), user: { id: user.id, email: user.email, roles: user.roles } });
});

// Refresh
router.post('/refresh', async (req, res) => {
  const rt = req.cookies?.rt;
  if (!rt) return res.status(401).json({ error: 'No refresh token' });
  try {
    const d = jwt.verify(rt, REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: Number(d.sub) } });
    if (!user || user.refreshVersion !== d.rv) return res.status(401).json({ error: 'Refresh invalidated' });
    const payload = { sub: String(user.id), email: user.email, roles: user.roles, rv: user.refreshVersion };
    setRTC(res, signRT(payload)); 
    res.json({ accessToken: signAT(payload) });
  } catch { res.status(401).json({ error: 'Invalid refresh token' }); }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const rt = req.cookies?.rt;
    if (rt) {
      const d = jwt.verify(rt, REFRESH_SECRET);
      await prisma.user.update({ where: { id: Number(d.sub) }, data: { refreshVersion: { increment: 1 } } });
    }
  } catch {}
  res.clearCookie('rt', { path: '/auth' });
  res.json({ ok: true });
});

module.exports = { authRouter: router, requireAuth };
