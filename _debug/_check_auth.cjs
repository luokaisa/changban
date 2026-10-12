const fs = require('fs');
const f = fs.readFileSync('server/middleware/auth.js', 'utf8');
console.log(f);
