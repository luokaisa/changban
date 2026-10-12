import https from 'https';

// 直接在服务端调用阿里云 PNS 接口
// 这个接口是 H5 SDK 内部使用的，不需要 React
async function callPnsAuth(schemeCode, phone) {
  const params = new URLSearchParams({
    schemeCode,
    phoneNo: phone || '',
    type: 'H5',
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'dypns.alysm.cn',
      path: '/pns/authPnsWeb',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params.toString()),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('解析失败: ' + data.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

const result = await callPnsAuth('FC220000013025071', '13800138000');
console.log('Result:', JSON.stringify(result, null, 2));
