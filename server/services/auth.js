const crypto = require('crypto');
const storage = require('./storage');

const TOKEN_EXPIRY = 7 * 24 * 3600 * 1000; // 7天

// 会话持久化到文件，重启不丢失
function loadSessions() {
  return storage.read('sessions');
}

function saveSessions(sessions) {
  storage.write('sessions', sessions);
}

/**
 * 密码哈希
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * 验证密码
 */
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === verify;
}

/**
 * 创建用户
 */
function createUser(username, password, role = 'user') {
  const users = storage.read('users');
  if (users[username]) return null;
  users[username] = {
    id: crypto.randomUUID().slice(0, 8),
    username,
    passwordHash: hashPassword(password),
    role,
    createdAt: Date.now(),
  };
  storage.write('users', users);
  return { id: users[username].id, username, role };
}

/**
 * 登录
 */
function login(username, password) {
  const users = storage.read('users');
  const user = users[username];
  if (!user || !verifyPassword(password, user.passwordHash)) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const sessions = loadSessions();
  sessions[token] = {
    userId: user.id,
    username: user.username,
    role: user.role,
    expiresAt: Date.now() + TOKEN_EXPIRY,
  };
  saveSessions(sessions);
  return token;
}

/**
 * 验证 token
 */
function verifyToken(token) {
  const sessions = loadSessions();
  const exists = !!sessions[token];
  if (!exists) {
    console.log('[Auth] verifyToken: token not found, total sessions:', Object.keys(sessions).length);
    return null;
  }
  const session = sessions[token];
  if (Date.now() > session.expiresAt) {
    delete sessions[token];
    saveSessions(sessions);
    return null;
  }
  return { userId: session.userId, username: session.username, role: session.role };
}

/**
 * 退出登录
 */
function logout(token) {
  const sessions = loadSessions();
  delete sessions[token];
  saveSessions(sessions);
}

/**
 * 检查是否首次使用
 */
function hasAnyUser() {
  const users = storage.read('users');
  return Object.keys(users).length > 0;
}

module.exports = { createUser, login, verifyToken, logout, hasAnyUser };
