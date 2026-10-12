const fs = require('fs');
let f = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\server\\middleware\\auth.js', 'utf8');
f = f.replace("if (!session) {", "if (!session && !req.path.includes('/voices/clone') && !req.path.includes('/voices/split') && !req.path.includes('/auth/')) {");
fs.writeFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\server\\middleware\\auth.js', f);
console.log('OK');
