const http = require('http');
// Test with correct password (phone last 6 digits)
const data = JSON.stringify({ username: 'u5120', password: '415120' });
const req = http.request('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => console.log('Login:', res.statusCode, body));
});
req.write(data);
req.end();
