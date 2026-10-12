const http = require('http');
const fs = require('fs');

// Create a small test audio file (1 second of silence)
const testFile = __dirname + '/test_audio.wav';
const wavHeader = Buffer.alloc(44);
wavHeader.write('RIFF', 0);
wavHeader.writeUInt32LE(36, 4);  // file size - 8
wavHeader.write('WAVE', 8);
wavHeader.write('fmt ', 12);
wavHeader.writeUInt32LE(16, 16); // chunk size
wavHeader.writeUInt16LE(1, 20);  // PCM
wavHeader.writeUInt16LE(1, 22);  // mono
wavHeader.writeUInt32LE(8000, 24); // sample rate
wavHeader.writeUInt32LE(16000, 28); // byte rate
wavHeader.writeUInt16LE(2, 32);  // block align
wavHeader.writeUInt16LE(16, 34); // bits per sample
wavHeader.write('data', 36);
wavHeader.writeUInt32LE(8000, 40); // data size (1 sec)

const audioData = Buffer.alloc(8000, 0); // 1 second of silence
fs.writeFileSync(testFile, Buffer.concat([wavHeader, audioData]));

// Now try to split it via the API
const token = 'e15a81683449bbcbacb163ef314566f488a8d4510609894d3e32e25caf120eda';
const boundary = '----TestBoundary123';
const fileContent = fs.readFileSync(testFile);
fs.unlinkSync(testFile);

// Build multipart form data manually
let body = '';
body += '--' + boundary + '\r\n';
body += 'Content-Disposition: form-data; name="video"; filename="test.wav"\r\n';
body += 'Content-Type: audio/wav\r\n\r\n';
const bodyBuf = Buffer.concat([
  Buffer.from(body, 'utf8'),
  fileContent,
  Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8')
]);

const req = http.request('http://localhost:3000/api/voices/split/test123', {
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': bodyBuf.length,
    'x-auth-token': token
  }
}, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', d.substring(0, 500));
  });
});
req.write(bodyBuf);
req.end();
