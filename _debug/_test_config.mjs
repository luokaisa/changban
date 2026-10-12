import https from 'https';

// 从 SDK 代码看，queryAppConfig 可能接受这些参数
// 添加 os 参数
const params = new URLSearchParams({
  schemeCode: 'FC220000013025071',
  os: 'H5',      // 试试 H5
  // 或者 os: 'web'
});

const req = https.request({
  hostname: 'dypns.alysm.cn',
  path: '/queryAppConfig?' + params.toString(),
  method: 'GET',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
  },
}, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
  });
});
req.on('error', e => console.log('Error:', e.message));
req.end();
