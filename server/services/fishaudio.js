const { Session, TTSRequest } = require('fish-audio-sdk');
const ffmpegPath = require('ffmpeg-static');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../config');

const BASE = 'https://api.fish.audio';

function getSession(apiKey) {
  const key = apiKey || config.fishaudio.apiKey;
  if (!key) throw new Error('服务端未配置 Fish Audio Key');
  return new Session(key);
}

/**
 * 音频转标准 WAV
 */
function convertToWav(inputBuffer) {
  const tmpIn = path.join(os.tmpdir(), `fa_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmpOut = path.join(os.tmpdir(), `fa_out_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

  try {
    fs.writeFileSync(tmpIn, inputBuffer);

    const result = spawnSync(ffmpegPath, [
      '-y',
      '-i', tmpIn,
      '-ar', '44100',     // 44.1kHz 更好的音质
      '-ac', '1',
      '-sample_fmt', 's16',
      '-f', 'wav',
      tmpOut,
    ], { timeout: 30000 });

    if (result.status !== 0) {
      const errMsg = result.stderr.toString().slice(-300);
      throw new Error(`音频转换失败: ${errMsg}`);
    }

    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

/**
 * 声音克隆 — 用 SDK 创建模型
 */
async function cloneVoice(name, audioBuffer, apiKey) {
  const wavBuffer = convertToWav(audioBuffer);
  const session = getSession(apiKey);

  console.log(`[FishAudio] 开始克隆: ${name}, WAV大小: ${(wavBuffer.length/1024).toFixed(1)}KB`);

  const model = await session.createModel({
    title: name,
    voices: [wavBuffer],
    trainMode: 'fast',
    visibility: 'private',
    type: 'tts',
    enhanceAudioQuality: true,
  });

  const modelId = model.id || model._id;
  console.log(`[FishAudio] 克隆成功: ${modelId}`);
  return modelId;
}

/**
 * 文字转语音
 */
async function textToSpeech(text, modelId, apiKey) {
  const session = getSession(apiKey);
  const req = new TTSRequest(text, {
    modelId,
    format: 'mp3',
    latency: 'balanced',
  });

  console.log(`[FishAudio] TTS: text="${text.slice(0,30)}...", modelId=${modelId}`);

  const stream = await session.tts(req);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const result = Buffer.concat(chunks);
  console.log(`[FishAudio] TTS 成功: ${result.length} bytes`);
  return result;
}

module.exports = { convertToWav, cloneVoice, textToSpeech };
