const https = require('https');
const token = 'e15a81683449bbcbacb163ef314566f488a8d4510609894d3e32e25caf120eda';
const b = Buffer.from('test data');
const boundary = '----Test' + Date.now();
const body = '--' + boundary + '\r\nContent-Disposition: form-data; name="name"\r\n\r\nTest\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="audio"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\n' + b.toString() + '\r\n--' + boundary + '--\r\n';
const buf = Buffer.from(body, 'utf8');

const opt = {
  hostname: 'changban.xyz',
  path: '/api/voices/clone/test123?auth=' + encodeURIComponent(token),
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': buf.length
  }
};

const r = https.request(opt, function(res) {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', d.substring(0, 500)));
});
r.on('error', e => console.log('Error:', e.message));
r.write(buf);
r.end();
