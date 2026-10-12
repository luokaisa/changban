const fs = require('fs');
let f = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\public\\js\\app.js', 'utf8');
// Change cloneVoice to use query param for token
f = f.replace(
  "fd.append('audio', file);\n  fd.append('auth', getToken() || '');",
  "fd.append('audio', file);"
);
f = f.replace(
  "var res = await fetch('/api/voices/clone/' + id, { method: 'POST', body: fd });",
  "var res = await fetch('/api/voices/clone/' + id + '?auth=' + encodeURIComponent(getToken() || ''), { method: 'POST', body: fd });"
);
// Same for uploadAndSplit
f = f.replace(
  "fd.append('video', file);\n  fd.append('auth', getToken() || '');",
  "fd.append('video', file);"
);
f = f.replace(
  "var res = await fetch('/api/voices/split/' + id, {",
  "var res = await fetch('/api/voices/split/' + id + '?auth=' + encodeURIComponent(getToken() || ''), {"
);
// Same for uploadAvatar
f = f.replace(
  "fd.append('auth', getToken() || '');\n    fd.append('avatar', file);\n    try {\n    var res = await fetch('/api/avatar/",
  "fd.append('avatar', file);\n    try {\n    var res = await fetch('/api/avatar/"
);
f = f.replace(
  "var res = await fetch('/api/avatar/' + id, {",
  "var res = await fetch('/api/avatar/' + id + '?auth=' + encodeURIComponent(getToken() || ''), {"
);
fs.writeFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\public\\js\\app.js', f);
console.log('OK');
