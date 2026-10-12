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
};
