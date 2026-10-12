const fs = require('fs');
const html = fs.readFileSync('C:\\Users\\<原开发者>\\AppData\\Local\\Temp\\aliyun_h5.html', 'utf8');
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Search for key integration patterns
const searches = [
  'getPhoneNumber', 'init', 'schemeCode', 'ACMNumberAuth',
  'numberAuth', 'window.', 'script src', 'import',
  'getToken', 'spToken', 'config'
];

searches.forEach(s => {
  let idx = 0;
  while ((idx = text.indexOf(s, idx)) >= 0) {
    console.log(`\n=== ${s} at ${idx} ===`);
    console.log(text.substring(Math.max(0, idx - 80), idx + 200));
    idx += 1;
  }
});
