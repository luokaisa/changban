const fs = require('fs');
const sdk = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\public\\assets\\numberAuth-sdk.bundle.js', 'utf8');

// Just find all window.X = assignments
const regex = /window\.(\w+)\s*=\s*/g;
let match;
const exports = new Set();
while ((match = regex.exec(sdk)) !== null) {
  const name = match[1];
  // Skip common built-ins
  if (!['navigator','console','location','document','atob','Session',
        'performance','setTimeout','clearTimeout','setInterval','clearInterval',
        'XMLHttpRequest','fetch','crypto','location','localStorage','sessionStorage',
        'innerWidth','innerHeight','screen','devicePixelRatio','AudioContext',
        'webkitAudioContext','webkitSpeechRecognition','Worker'].includes(name)) {
    exports.add(name);
  }
}
console.log('Window exports:');
[...exports].sort().forEach(e => console.log('  window.' + e));

// Also check for UMD patterns
if (sdk.includes('define(function')) console.log('Has AMD define');
if (sdk.includes('exports,module')) console.log('Has CommonJS exports');
if (sdk.includes('typeof exports')) console.log('Has typeof exports check');
