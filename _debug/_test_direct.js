const crypto = require('crypto');
const https = require('https');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const ak = process.env.ALIYUN_ACCESS_KEY_ID;
const sk = process.env.ALIYUN_ACCESS_KEY_SECRET;

async function test() {
  const params = {
    Action: 'GetAuthorizationUrl',
    Format: 'JSON',
    Version: '2017-05-25',
    AccessKeyId: ak,
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: Math.random().toString(36).substring(2, 15),
    SchemeId: 'FC220000013025071',
    PhoneNo: '13800138000',
    Type: 'H5',
  };

  console.log('Params:');
  Object.entries(params).forEach(([k, v]) => console.log(`  ${k}=${v}`));

  const sortedKeys = Object.keys(params).sort();
  const canonicalizedQuery = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  const stringToSign = `POST&${encodeURIComponent('/')}&${encodeURIComponent(canonicalizedQuery)}`;
  const signature = crypto.createHmac('sha1', `${sk}&`).update(stringToSign).digest('base64');
  params.Signature = signature;

  const body = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  console.log('\nStringToSign:', stringToSign);
  console.log('Signature:', signature);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'dypnsapi.aliyuncs.com',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('\nResponse:', data);
        resolve(data);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

test().catch(console.error);
