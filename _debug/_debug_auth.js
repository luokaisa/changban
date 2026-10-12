const fs = require('fs');
let f = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\server\\middleware\\auth.js', 'utf8');
f = f.replace("const session = auth.verifyToken(token);", "const session = auth.verifyToken(token);\n  console.log('[AUTH] path:', req.path, 'hasToken:', !!token, 'session:', !!session, 'skipClone:', req.path.includes('/voices/clone'));");
fs.writeFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\server\\middleware\\auth.js', f);
console.log('OK');
