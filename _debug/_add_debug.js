const fs = require('fs');
const fp = 'C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\server\\routes\\auth.js';
let f = fs.readFileSync(fp, 'utf8');

const debugRoute = "router.get('/token-check', (req, res) => {\n  var t = req.headers['x-auth-token'] || '';\n  var sv = require('../services/auth').verifyToken(t);\n  res.json({ received: t ? t.substring(0, 12) + '...' : null, valid: !!sv, user: sv ? { id: sv.userId, username: sv.username } : null });\n});\n\n";

if (f.includes('/token-check')) {
  console.log('Already added');
  process.exit(0);
}

f = f.replace("// ===== 手机号注册入口 -->", debugRoute + "// ===== 手机号注册入口 -->");
fs.writeFileSync(fp, f);
console.log('OK');
