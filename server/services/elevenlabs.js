const config = require('../config');
const https = require('https');
const ffmpegPath = require('ffmpeg-static');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = 'https://api.elevenlabs.io';

function getKey(apiKey) {
  return apiKey || config.elevenlabs.apiKey;
}

/**
 * 发起 ElevenLabs API 请求
 */
function apiRequest(method, urlPath, body, apiKey, binary = false) {
  return new Promise((resolve, reject) => {
    const key = getKey(apiKey);
    if (!key) return reject(new Error('服务端未配置 ElevenLabs API Key'));

    const url = new URL(BASE + urlPath);
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'xi-api-key': key,
      },
    };

    if (body && !binary) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const ct = res.headers['content-type'] || '';
        if (res.statusCode >= 400) {
          let errMsg;
          try {
            const parsed = JSON.parse(buf.toString());
            errMsg = parsed.detail?.message || parsed.detail || JSON.stringify(parsed);
          } catch {
            errMsg = buf.toString().slice(0, 200);
          }
          return reject(new Error(errMsg));
        }
        if (ct.includes('json')) {
          try { resolve(JSON.parse(buf.toString())); }
          catch { resolve(buf.toString()); }
        } else {
          resolve(buf);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body) || binary) {
        req.write(body);
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

/**
 * 音频转标准 WAV
 */
function convertToWav(inputBuffer) {
  const tmpIn = path.join(os.tmpdir(), `el_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmpOut = path.join(os.tmpdir(), `el_out_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  try {
    fs.writeFileSync(tmpIn, inputBuffer);
    const result = spawnSync(ffmpegPath, [
      '-y', '-i', tmpIn,
      '-ar', '44100', '-ac', '1', '-sample_fmt', 's16', '-f', 'wav', tmpOut,
    ], { timeout: 30000 });
    if (result.status !== 0) {
      throw new Error('音频转换失败: ' + result.stderr.toString().slice(-200));
    }
    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

/**
 * Instant Voice Clone — 上传录音克隆声音
 * @returns {string} voice_id
 */
async function cloneVoice(name, audioBuffer, apiKey) {
  const wavBuffer = convertToWav(audioBuffer);
  const key = getKey(apiKey);

  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

  let body = Buffer.alloc(0);
  body = Buffer.concat([body,
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${name}\r\n`, 'latin1'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="sample.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`, 'latin1'),
    wavBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1'),
  ]);

  const url = new URL(BASE + '/v1/voices/add');
  const opts = {
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname,
    headers: {
      'xi-api-key': key,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          try {
            const parsed = JSON.parse(data);
            reject(new Error(parsed.detail?.message || parsed.detail || JSON.stringify(parsed)));
          } catch {
            reject(new Error(data.slice(0, 200)));
          }
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.voice_id);
        } catch {
          reject(new Error('克隆失败'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 文字转语音
 * @returns {Buffer} MP3 音频
 */
async function textToSpeech(text, voiceId, apiKey) {
  const body = JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.85,
      style: 0.0,
    },
  });

  const key = getKey(apiKey);
  const url = new URL(BASE + `/v1/text-to-speech/${voiceId}`);

  return new Promise((resolve, reject) => {
    const opts = {
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          const errMsg = Buffer.concat(chunks).toString();
          try {
            const parsed = JSON.parse(errMsg);
            reject(new Error(parsed.detail?.message || parsed.detail || errMsg));
          } catch {
            reject(new Error(`TTS 失败 (${res.statusCode})`));
          }
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 删除云端克隆声音（用户删角色/删号/下架时调用）
 * 成功 resolve true；voice 不存在也视为成功（幂等）
 */
async function deleteVoice(voiceId, apiKey) {
  if (!voiceId) return true;
  try {
    await apiRequest('DELETE', '/v1/voices/' + encodeURIComponent(voiceId), null, apiKey);
    return true;
  } catch (err) {
    // 已不存在视为成功，避免残留记录卡住删除流程
    if (/not\s*found|404/i.test(err.message)) return true;
    throw err;
  }
}

module.exports = { cloneVoice, textToSpeech, deleteVoice };
