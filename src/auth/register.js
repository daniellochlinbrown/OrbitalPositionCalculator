// POST /auth/register expects { email, password }
router.post('/register', express.json(), async (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 8)   return res.status(400).json({ error: 'password must be at least 8 chars' });

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'email already registered' });

  const passHash = await argon2.hash(password);
  const user = await prisma.user.create({ data: { email, passHash, roles: 'user' } });

  const payload = { sub: String(user.id), email: user.email, roles: user.roles, rv: user.refreshVersion };
  setRTC(res, signRT(payload)); // set refresh cookie
  res.status(201).json({ accessToken: signAT(payload), user: { id: user.id, email: user.email, roles: user.roles } });
});
