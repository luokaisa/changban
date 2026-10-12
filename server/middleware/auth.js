const auth = require('../services/auth');

function requireAuth(req, res, next) {
  // 用 originalUrl 获取完整路径
  const fullPath = req.originalUrl || req.url;
  
  if (fullPath.startsWith('/api/auth/')) return next();

  let token = req.headers['x-auth-token'];
  if (!token && req.body && req.body.auth) token = req.body.auth;
  if (!token && req.query && req.query.auth) token = req.query.auth;

  const session = auth.verifyToken(token);
  
  if (!session) {
    return res.status(401).json({ error: '请先登录' });
  }
  req.user = session;
  next();
}

module.exports = { requireAuth };
