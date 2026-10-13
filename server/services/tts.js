// TTS 网关：可插拔 provider，方言参数直通
// - elevenlabs（当前）：中文方言不支持，用原文合成（文字层已是方言文本）
// - doubao（待 FF 给 API 后实现）：支持多方言，dialect 直通引擎
const elevenlabs = require('./elevenlabs');

const PROVIDER = process.env.TTS_PROVIDER || 'elevenlabs';

async function doubaoSynthesize(text, voiceId, opts) {
  // TODO: FF 提供豆包 TTS API 后实现
  // 预计：doubaoApi.speech({ text, voice: voiceId, dialect: opts.dialect || '普通话', ... })
  throw new Error('豆包 TTS 尚未接入，请先配置 TTS_PROVIDER=elevenlabs');
}

async function synthesize(text, voiceId, opts = {}) {
  const dialect = opts.dialect || '';
  if (PROVIDER === 'doubao') {
    return doubaoSynthesize(text, voiceId, { ...opts, dialect });
  }
  if (dialect && dialect !== '普通话' && dialect !== '') {
    console.log(`[TTS] ElevenLabs 暂不支持方言「${dialect}」，用原文合成（文字已是方言）`);
  }
  return elevenlabs.textToSpeech(text, voiceId);
}

module.exports = { synthesize, PROVIDER };
