const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    const headerToken = m ? m[1] : null;
    const cookieToken = req.cookies?.accessToken || null;
    const token = headerToken || cookieToken;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, roles: payload.roles || 'user' };
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
