import Dysmsapi from '@alicloud/dysmsapi20170525';
import OpenApi from '@alicloud/openapi-client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

  // Try Aliyun's built-in test template
  const testTemplates = [
    { code: 'SMS_154950909', name: '通用验证码测试' },
    { code: 'SMS_277650195', name: '号码认证测试模板' },
  ];

  for (const tpl of testTemplates) {
    try {
      const req = new Dysmsapi.SendSmsRequest({
        phoneNumbers: '13800138000', // test number
        signName: '阿里云短信测试', // default test signature
        templateCode: tpl.code,
        templateParam: JSON.stringify({ code: '123456' }),
      });
      const res = await client.sendSms(req);
      console.log(`Template ${tpl.code} (${tpl.name}):`, res.body.code, res.body.message);
    } catch (err) {
      console.log(`Template ${tpl.code} (${tpl.name}):`, err.message?.substring(0, 100));
    }
  }
}

testSms().catch(console.error);
