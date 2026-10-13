const express = require('express');
const router = express.Router();
const auth = require('../services/auth');
const phoneAuth = require('../services/phoneAuth');

const SCHEME_CODE = 'FC220000013025071';

// ===== 获取 H5 SDK 初始化令牌 =====
const h5Token = require('../services/h5Token');

router.get('/token-check', (req, res) => {
  res.json({ token: req.headers['x-auth-token'] || 'none', method: req.method, path: req.path });
});

router.post('/get-h5-token', async (req, res) => {
  try {
    const { schemeCode } = req.body;
    const result = await h5Token.getH5AccessToken(schemeCode || SCHEME_CODE);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 获取认证配置（H5 SDK 使用） =====
router.post('/get-auth-config', (req, res) => {
  const { schemeCode } = req.body;
  res.json({
    schemeCode: schemeCode || SCHEME_CODE,
    carrierEndpoints: {
      cm: 'https://dypns-operator.oss-cn-hangzhou.aliyuncs.com/cmLoginJssdk',
      cu: 'https://dypns-operator.oss-cn-hangzhou.aliyuncs.com/cuLoginJssdk',
      ct: 'https://dypns-operator.oss-cn-hangzhou.aliyuncs.com/EAccountSDK-fjs-1.5.1.min.js',
    },
    pnsEndpoint: 'https://dypns.alysm.cn/pns/authPnsWeb',
  });
});

// ===== 手机号一键登录 - 获取认证URL =====
router.get('/phone-login-url', async (req, res) => {
  try {
    const callbackUrl = `https://changban.xyz/phone-auth.html`;
    const url = await phoneAuth.getAuthUrl(SCHEME_CODE, callbackUrl);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 手机号一键登录（带手机号） =====
router.post('/phone-login-url', async (req, res) => {
  try {
    const { phone } = req.body;
    if (phone && !/^1\d{10}$/.test(phone)) {
      return res.status(400).json({ error: '请输入正确的手机号' });
    }
    const callbackUrl = `https://changban.xyz/phone-auth.html`;
    const url = await phoneAuth.getAuthUrl(SCHEME_CODE, callbackUrl, phone || undefined);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 手机号一键登录 - 验证 =====
router.post('/phone-login', async (req, res) => {
  try {
    const { spToken } = req.body;
    if (!spToken) return res.status(400).json({ error: '缺少认证凭证' });

    // 获取手机号
    const phone = await phoneAuth.getPhoneBySpToken(spToken);

    // 找已有用户或自动注册
    const storage = require('../services/storage');
    const users = storage.read('users');
    let user = Object.values(users).find(u => u.phone === phone);
    
    if (!user) {
      // 自动注册
      const username = 'u' + phone.slice(-4);
      const role = auth.hasAnyUser() ? 'user' : 'admin';
      const created = auth.createUser(username, phone.slice(-6), role);
      if (!created) return res.status(500).json({ error: '注册失败' });
      // 保存手机号（一键登录自动注册的账号记为未实名，需在设置页补认证）
      const u = storage.read('users');
      if (u[username]) {
        u[username].phone = phone;
        u[username].verified = false;
        storage.write('users', u);
      }
      user = { id: u[username].id, username, role };
    }

    const tk = auth.login(user.username, user.phone?.slice(-6) || phone.slice(-6));
    if (!tk) return res.status(500).json({ error: '登录失败' });

    res.json({ token: tk, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 发送验证码（个人项目，验证码直接返回给管理员） =====
const fs = require('fs');
const path = require('path');
const verifyCodes = {};

router.post('/send-code', (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }
  
  const code = String(Math.floor(100000 + Math.random() * 900000));
  verifyCodes[phone] = { code, expiresAt: Date.now() + 300000 }; // 5分钟有效
  
  // 写入文件供管理员查看
  const codeFile = path.join(__dirname, '..', '..', 'data', 'verify-codes.json');
  try {
    const bak = fs.existsSync(codeFile) ? JSON.parse(fs.readFileSync(codeFile, 'utf8')) : {};
    bak[phone] = { code, expiresAt: Date.now() + 300000, createdAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(codeFile), { recursive: true });
    fs.writeFileSync(codeFile, JSON.stringify(bak, null, 2));
  } catch(e) { /* ignore */ }
  
  res.json({ success: true, message: '验证码已发送' });
});

router.post('/verify-code', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: '参数不完整' });
  
  const record = verifyCodes[phone];
  if (!record) return res.status(400).json({ error: '请先获取验证码' });
  if (Date.now() > record.expiresAt) {
    delete verifyCodes[phone];
    return res.status(400).json({ error: '验证码已过期' });
  }
  if (record.code !== code) return res.status(400).json({ error: '验证码错误' });
  
  delete verifyCodes[phone];
  
  // 检查手机号是否已注册
  const storage = require('../services/storage');
  const users = storage.read('users');
  const existingUser = Object.values(users).find(u => u.phone === phone);
  
  if (existingUser) {
    // 已注册：直接登录
    const tk = auth.login(existingUser.username, existingUser.phone?.slice(-6) || phone.slice(-6));
    if (!tk) return res.status(500).json({ error: '登录失败' });
    return res.json({ token: tk, user: { id: existingUser.id, username: existingUser.username, role: existingUser.role }, existing: true });
  }
  
  // 新用户：返回验证令牌，前端弹注册表单
  const verifyToken = require('crypto').randomBytes(16).toString('hex');
  // 存验证令牌（有效期10分钟）
  const vf = path.join(__dirname, '..', '..', 'data', 'verify-tokens.json');
  try {
    const bak = fs.existsSync(vf) ? JSON.parse(fs.readFileSync(vf, 'utf8')) : {};
    bak[verifyToken] = { phone, expiresAt: Date.now() + 600000 };
    fs.mkdirSync(path.dirname(vf), { recursive: true });
    fs.writeFileSync(vf, JSON.stringify(bak, null, 2));
  } catch(e) { /* ignore */ }
  
  res.json({ verified: true, verifyToken, existing: false });
});

// ===== 合规：实名认证（新用户注册流程，凭 verifyToken） =====
const idverify = require('../services/idverify');

router.post('/verify-id', async (req, res) => {
  const { verifyToken, realName, idcard } = req.body;
  if (!verifyToken || !realName || !idcard) return res.status(400).json({ error: '参数不完整' });

  const vf = path.join(__dirname, '..', '..', 'data', 'verify-tokens.json');
  let tokens = {};
  try { tokens = JSON.parse(fs.readFileSync(vf, 'utf8')); } catch(e) {}
  const record = tokens[verifyToken];
  if (!record) return res.status(400).json({ error: '验证已过期，请重新获取验证码' });
  if (Date.now() > record.expiresAt) {
    delete tokens[verifyToken];
    fs.writeFileSync(vf, JSON.stringify(tokens, null, 2));
    return res.status(400).json({ error: '验证已过期，请重新获取验证码' });
  }

  const result = await idverify.verify(realName, idcard);
  if (!result.ok) return res.status(400).json({ error: result.message });

  // 实名通过：身份证号原文不落盘，只存脱敏号 + 哈希 + 证件解析出的出生日期
  const id = idcard.trim().toUpperCase();
  record.idVerified = true;
  record.realName = realName.trim();
  record.idMasked = idverify.maskId(id);
  record.idHash = idverify.hashId(id);
  record.birthdate = result.birthdate || '';
  record.idVerifiedAt = Date.now();
  fs.writeFileSync(vf, JSON.stringify(tokens, null, 2));

  res.json({ success: true, birthdate: record.birthdate });
});

// ===== 合规：实名认证（已登录老用户补认证，含一键登录自动注册的账号） =====
router.post('/verify-id/me', async (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: '未登录' });
  const session = auth.verifyToken(token);
  if (!session) return res.status(401).json({ error: '登录已过期' });

  const { realName, idcard } = req.body;
  if (!realName || !idcard) return res.status(400).json({ error: '参数不完整' });

  const result = await idverify.verify(realName, idcard);
  if (!result.ok) return res.status(400).json({ error: result.message });

  const storage = require('../services/storage');
  const users = storage.read('users');
  const user = users[session.username];
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const id = idcard.trim().toUpperCase();
  user.verified = true;
  user.realName = realName.trim();
  user.idMasked = idverify.maskId(id);
  user.idHash = idverify.hashId(id);
  user.idVerifiedAt = Date.now();
  if (result.birthdate) user.birthdate = result.birthdate; // 证件年龄为准
  storage.write('users', users);

  res.json({ success: true });
});

// ===== 手机号验证后注册（设置用户名+密码） =====
router.post('/register-by-phone', (req, res) => {
  const { verifyToken, username, password, birthdate } = req.body;
  if (!verifyToken || !username || !password) return res.status(400).json({ error: '参数不完整' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });
  if (username.length < 2) return res.status(400).json({ error: '用户名至少2个字符' });

  // 合规：必须先完成实名认证；年龄以证件解析为准
  const vf = path.join(__dirname, '..', '..', 'data', 'verify-tokens.json');
  let tokens = {};
  try { tokens = JSON.parse(fs.readFileSync(vf, 'utf8')); } catch(e) {}
  const record = tokens[verifyToken];
  if (!record || !record.idVerified) return res.status(403).json({ error: '请先完成实名认证' });
  const realBirthdate = record.birthdate || birthdate;
  if (!isAdult(realBirthdate)) return res.status(403).json({ error: '根据法规要求，本服务仅向年满18岁的用户提供' });

  // 验证令牌（上文已读 record，此处只做过期检查）
  if (Date.now() > record.expiresAt) {
    delete tokens[verifyToken];
    fs.writeFileSync(vf, JSON.stringify(tokens, null, 2));
    return res.status(400).json({ error: '验证已过期，请重新获取验证码' });
  }
  
  delete tokens[verifyToken];
  fs.writeFileSync(vf, JSON.stringify(tokens, null, 2));
  
  // 创建用户
  const role = auth.hasAnyUser() ? 'user' : 'admin';
  const created = auth.createUser(username, password, role);
  if (!created) return res.status(409).json({ error: '用户名已存在' });
  
  // 保存手机号、出生日期与实名信息（身份证号原文不落盘）
  const storage = require('../services/storage');
  const users = storage.read('users');
  if (users[username]) {
    users[username].phone = record.phone;
    users[username].birthdate = realBirthdate;
    users[username].verified = true;
    users[username].realName = record.realName;
    users[username].idMasked = record.idMasked;
    users[username].idHash = record.idHash;
    users[username].idVerifiedAt = record.idVerifiedAt;
    storage.write('users', users);
  }
  
  // 自动登录
  const tk = auth.login(username, password);
  if (!tk) return res.status(500).json({ error: '登录失败' });
  
  res.json({ token: tk, user: { id: created.id, username, role } });
});

// ===== 状态检查 =====
router.get('/status', (req, res) => {
  res.json({ hasUsers: auth.hasAnyUser() });
});

// ===== 合规：未成年人禁入（虚拟亲属服务不得向未满18岁提供） =====
function isAdult(birthdate) {
  if (!birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return false;
  const b = new Date(birthdate + 'T00:00:00');
  if (isNaN(b.getTime()) || b.getTime() > Date.now()) return false;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 18;
}

// ===== 注册（第一个用户为管理员，后续用户由管理员添加） =====
router.post('/register', (req, res) => {
  const { username, password, birthdate } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请填写用户名和密码' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });
  if (username.length < 2) return res.status(400).json({ error: '用户名至少2个字符' });
  if (!isAdult(birthdate)) return res.status(403).json({ error: '根据法规要求，本服务仅向年满18岁的用户提供' });

  const role = auth.hasAnyUser() ? 'user' : 'admin';
  const user = auth.createUser(username, password, role);
  if (!user) return res.status(409).json({ error: '用户名已存在' });

  const storage = require('../services/storage');
  const users = storage.read('users');
  if (users[username]) { users[username].birthdate = birthdate; storage.write('users', users); }

  const token = auth.login(username, password);
  res.json({ token, user });
});

// ===== 登录 =====
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请填写用户名和密码' });

  const token = auth.login(username, password);
  if (!token) return res.status(401).json({ error: '用户名或密码错误' });

  const session = auth.verifyToken(token);
  res.json({ token, user: { id: session.userId, username: session.username, role: session.role } });
});

// ===== 修改密码 =====
router.post('/change-password', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: '请先登录' });
  const session = auth.verifyToken(token);
  if (!session) return res.status(401).json({ error: '登录已过期' });
  
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写旧密码和新密码' });
  if (newPassword.length < 4) return res.status(400).json({ error: '新密码至少4位' });
  
  const storage = require('../services/storage');
  const users = storage.read('users');
  const user = users[session.username];
  if (!user) return res.status(404).json({ error: '用户不存在' });
  
  // 验证旧密码
  const crypto = require('crypto');
  const [salt, hash] = user.passwordHash.split(':');
  const verify = crypto.scryptSync(oldPassword, salt, 64).toString('hex');
  if (hash !== verify) return res.status(400).json({ error: '旧密码错误' });
  
  // 更新密码
  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = crypto.scryptSync(newPassword, newSalt, 64).toString('hex');
  user.passwordHash = `${newSalt}:${newHash}`;
  storage.write('users', users);
  
  // 生成新 token
  const newToken = auth.login(session.username, newPassword);
  res.json({ token: newToken, message: '密码已修改' });
});

// ===== 退出 =====
router.post('/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) auth.logout(token);
  res.json({ success: true });
});

// ===== 验证 Token =====
router.get('/me', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: '未登录' });
  const session = auth.verifyToken(token);
  if (!session) return res.status(401).json({ error: '登录已过期' });
  const storage = require('../services/storage');
  const u = storage.read('users')[session.username] || {};
  res.json({ user: { id: session.userId, username: session.username, role: session.role, verified: u.verified === true, realName: u.realName || '' } });
});

// ===== 合规：导出个人数据 =====
router.get('/export', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: '未登录' });
  const session = auth.verifyToken(token);
  if (!session) return res.status(401).json({ error: '登录已过期' });

  const storage = require('../services/storage');
  const users = storage.read('users');
  const chars = storage.read('characters');
  const conversations = storage.read('conversations');

  const user = users[session.username];
  const myChars = Object.fromEntries(
    Object.entries(chars).filter(([_, c]) => c.userId === session.userId)
  );
  const myConv = Object.fromEntries(
    Object.entries(conversations).filter(([k]) => k.startsWith(session.userId + '_'))
  );

  res.json({
    exportedAt: new Date().toISOString(),
    user: user ? { username: session.username, phone: user.phone || '', birthdate: user.birthdate || '', role: user.role, createdAt: user.createdAt, verified: user.verified === true, realName: user.realName || '', idMasked: user.idMasked || '', idVerifiedAt: user.idVerifiedAt || null } : null,
    characters: myChars,
    conversations: myConv,
  });
});

// ===== 合规：删除账号及全部个人数据（不可恢复） =====
router.delete('/account', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: '未登录' });
  const session = auth.verifyToken(token);
  if (!session) return res.status(401).json({ error: '登录已过期' });

  const storage = require('../services/storage');
  const users = storage.read('users');
  const chars = storage.read('characters');
  const conversations = storage.read('conversations');

  // 删角色
  for (const [id, c] of Object.entries(chars)) {
    if (c.userId === session.userId) delete chars[id];
  }
  storage.write('characters', chars);
  // 删对话
  for (const k of Object.keys(conversations)) {
    if (k.startsWith(session.userId + '_')) delete conversations[k];
  }
  storage.write('conversations', conversations);
  // 删用户并登出
  delete users[session.username];
  storage.write('users', users);
  auth.logout(token);

  // 注：ElevenLabs 侧克隆声音需在 ElevenLabs 控制台另行删除，见设置页说明
  res.json({ success: true });
});

module.exports = router;
