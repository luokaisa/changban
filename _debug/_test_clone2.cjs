const http = require('http');
const b = '--x\r\nContent-Disposition: form-data; name="audio"; filename="test.txt"\r\nContent-Type: text/plain\r\n\r\ntest\r\n--x--\r\n';
const r = http.request('http://localhost:3000/api/voices/clone/test123', {
  method: 'POST',
  headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': Buffer.byteLength(b) }
}, function(res) {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log('clone status:', res.statusCode, d.substring(0, 300)));
});
r.write(b);
r.end();
