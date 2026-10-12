const Dysmsapi = require('@alicloud/dysmsapi20170525');
const OpenApi = require('@alicloud/openapi-client');
const config = require('../config');

// 运行时检查是否有 Key
function getClient() {
  const ak = config.aliyun?.accessKeyId;
  const sk = config.aliyun?.accessKeySecret;
  if (!ak || !sk) {
    throw new Error('阿里云短信未配置，请在 .env 中设置 ALIYUN_ACCESS_KEY_ID 和 ALIYUN_ACCESS_KEY_SECRET');
  }

  const cfg = new OpenApi.Config({
    accessKeyId: ak,
    accessKeySecret: sk,
    endpoint: 'dysmsapi.aliyuncs.com',
  });
  return new Dysmsapi.default(cfg);
}

// 验证码存储（内存）
const codes = {};

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 发送验证码短信
 * 注意：需要在阿里云短信控制台申请签名和模板！
 * signName 和 templateCode 需要替换为你的实际值
 */
async function sendCode(phone) {
  const code = generateCode();

  // ⚠️ 以下参数需要你在阿里云短信控制台申请后替换：
  const signName = 'changban';           // 你的短信签名
  const templateCode = 'SMS_477230326';   // 你的验证码模板CODE

  const request = new Dysmsapi.SendSmsRequest({
    phoneNumbers: phone,
    signName,
    templateCode,
    templateParam: JSON.stringify({ code }),
  });

  try {
    const client = getClient();
    const res = await client.sendSms(request);
    if (res.body.code !== 'OK') {
      throw new Error(res.body.message || '发送失败');
    }
    codes[phone] = { code, expiresAt: Date.now() + 5 * 60 * 1000 };
    return true;
  } catch (err) {
    throw new Error(`短信发送失败: ${err.message}`);
  }
}

function verifyCode(phone, code) {
  const record = codes[phone];
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    delete codes[phone];
    return false;
  }
  if (record.code !== code) return false;
  delete codes[phone];
  return true;
}

module.exports = { sendCode, verifyCode };
