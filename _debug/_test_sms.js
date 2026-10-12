const Dysmsapi = require('@alicloud/dysmsapi20170525');
const OpenApi = require('@alicloud/openapi-client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const ak = process.env.ALIYUN_ACCESS_KEY_ID;
const sk = process.env.ALIYUN_ACCESS_KEY_SECRET;

async function testSms() {
  const cfg = new OpenApi.Config({
    accessKeyId: ak,
    accessKeySecret: sk,
    endpoint: 'dysmsapi.aliyuncs.com',
  });
  const client = new Dysmsapi.default(cfg);

  // Try test templates
  const tests = [
    { sign: '阿里云短信测试', template: 'SMS_154950909', desc: '通用验证码' },
    { sign: '阿里云短信测试', template: 'SMS_277650195', desc: '号码认证测试' },
    { sign: '阿里云短信', template: 'SMS_277650195', desc: '签名:阿里云短信' },
  ];

  for (const t of tests) {
    try {
      console.log(`\nTrying: ${t.desc} (sign=${t.sign}, template=${t.template})`);
      const req = new Dysmsapi.SendSmsRequest({
        phoneNumbers: '13800138000',
        signName: t.sign,
        templateCode: t.template,
        templateParam: JSON.stringify({ code: '123456' }),
      });
      const res = await client.sendSms(req);
      console.log('Result:', res.body.code, '-', res.body.message);
      if (res.body.code === 'OK') console.log('✅ SUCCESS!');
    } catch (err) {
      console.log('Error:', err.message?.substring(0, 150));
    }
  }
}

testSms().catch(console.error);
