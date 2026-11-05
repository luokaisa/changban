const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
  },
  fishaudio: {
    apiKey: process.env.FISH_AUDIO_API_KEY || '',
  },
  aliyun: {
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
  },
  dataDir: path.join(__dirname, '..', 'data'),
  uploadsDir: path.join(__dirname, '..', 'public', 'uploads'),
  // 临时测试：主站用户名密码注册。正式产品仍强制手机号注册。
  // 未设置时非 production 开启；DEV_REGISTER=false 或 NODE_ENV=production 关闭。
  devRegister: resolveDevRegister(),
};

function resolveDevRegister() {
  const v = (process.env.DEV_REGISTER || '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}
