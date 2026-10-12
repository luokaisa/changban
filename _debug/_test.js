const http = require('http');
const data = JSON.stringify({ phone: '13800138000' });
const req = http.request('http://localhost:3000/api/auth/phone-login-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
  });
});
req.write(data);
req.end();
