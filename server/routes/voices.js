const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const elevenlabs = require('../services/elevenlabs');
const storage = require('../services/storage');

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/** 校验角色存在且归属当前用户；不通过则返回 { status, error } */
function checkOwnership(characterId, userId) {
  const chars = storage.read('characters');
  const character = chars[characterId];
  if (!character) return { status: 404, error: '角色不存在' };
  if (character.userId !== userId) return { status: 403, error: '无权操作该角色' };
  return { character, chars };
}

/** 上传视频 -> 分割成多段音频，返回列表供用户选择 */
router.post('/split/:characterId', upload.single('video'), async (req, res) => {
  try {
    const { characterId } = req.params;
    const owned = checkOwnership(characterId, req.user.userId);
    if (owned.error) return res.status(owned.status).json({ error: owned.error });
    if (!req.file) return res.status(400).json({ error: '请上传视频文件' });

    const filePath = req.file.path;
    const workDir = filePath + '_split';
    fs.mkdirSync(workDir, { recursive: true });

    // 1. 提取音频
    const audioPath = path.join(workDir, 'audio.mp3');
    execSync(
      '"' + ffmpegPath + '" -i "' + filePath + '" -vn -acodec libmp3lame -ab 128k -ar 44100 -y "' + audioPath + '"',
      { stdio: 'pipe', timeout: 120000 }
    );

    // 2. 检测静音段（ffmpeg 的 silencedetect 输出到 stderr，用 2>&1 捕获）
    const detectOutput = execSync(
      '"' + ffmpegPath + '" -i "' + audioPath + '" -af silencedetect=n=-30dB:d=0.5 -f null - 2>&1',
      { stdio: 'pipe', timeout: 120000 }
    ).toString();

    // 3. 解析时间戳
    const startMatches = [...detectOutput.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
    const endMatches = [...detectOutput.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));

    const segments = [];
    let prevEnd = 0;

    const durationMatch = detectOutput.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const totalDuration = durationMatch
      ? parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3])
      : 0;

    for (let i = 0; i < startMatches.length; i++) {
      const silenceStart = startMatches[i];
      const silenceEnd = endMatches[i] || silenceStart + 1;
      if (silenceStart - prevEnd > 1.0) {
        segments.push({ start: prevEnd, end: silenceStart });
      }
      prevEnd = silenceEnd;
    }

    if (totalDuration - prevEnd > 1.0) {
      segments.push({ start: prevEnd, end: totalDuration });
    }

    if (segments.length === 0) {
      segments.push({ start: 0, end: totalDuration || 30 });
    }

    const validSegments = segments.filter(s => s.end - s.start >= 3).slice(0, 10);

    // 4. 为每段生成预览音频
    const publicDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'split');
    fs.mkdirSync(publicDir, { recursive: true });

    const segmentList = validSegments.map((seg, i) => {
      const segFile = 'seg_' + i + '.mp3';
      const segPath = path.join(workDir, segFile);
      const duration = seg.end - seg.start;
      const actualEnd = Math.min(seg.start + 15, seg.end);
      execSync(
        '"' + ffmpegPath + '" -i "' + audioPath + '" -ss ' + seg.start + ' -to ' + actualEnd + ' -acodec libmp3lame -ab 128k -y "' + segPath + '"',
        { stdio: 'pipe', timeout: 30000 }
      );
      // 复制到 public 目录
      const dstPath = path.join(publicDir, req.file.originalname + '_' + characterId + '_' + i + '.mp3');
      if (fs.existsSync(segPath)) fs.copyFileSync(segPath, dstPath);

      return {
        index: i,
        duration: Math.round(duration * 100) / 100,
        file: '/uploads/split/' + req.file.originalname + '_' + characterId + '_' + i + '.mp3',
        label: '片段 ' + (i + 1) + '（' + Math.round(duration) + '秒）',
      };
    });

    // 清理
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.unlinkSync(filePath);

    const chars = storage.read('characters');
    if (chars[characterId]) {
      chars[characterId].segments = segmentList;
      storage.write('characters', chars);
    }

    res.json({ segments: segmentList, totalSegments: validSegments.length });
  } catch (err) {
    console.error('[Split Error]', err.message);
    res.status(500).json({ error: '分割失败: ' + err.message });
  }
});

/** 克隆指定片段 */
router.post('/clone/:characterId', upload.single('audio'), async (req, res) => {
  try {
    const { characterId } = req.params;
    const owned = checkOwnership(characterId, req.user.userId);
    if (owned.error) return res.status(owned.status).json({ error: owned.error });
    const segmentIndex = req.body.segmentIndex;
    let audioBuffer;

    if (segmentIndex !== undefined) {
      const chars = storage.read('characters');
      const segs = (chars[characterId] && chars[characterId].segments) || [];
      const seg = segs[parseInt(segmentIndex)];
      if (!seg) return res.status(400).json({ error: '片段不存在' });
      const segFile = path.join(__dirname, '..', '..', 'public', 'uploads', 'split', path.basename(seg.file));
      if (!fs.existsSync(segFile)) return res.status(400).json({ error: '片段文件已过期，请重新上传' });
      audioBuffer = fs.readFileSync(segFile);
    } else if (req.file) {
      audioBuffer = fs.readFileSync(req.file.path);
      fs.unlinkSync(req.file.path);
    } else {
      return res.status(400).json({ error: '请选择要克隆的音频' });
    }

    const name = req.body.name || '我的亲人';
    console.log('[Clone] 克隆: ' + name + ', 大小: ' + (audioBuffer.length / 1024).toFixed(1) + 'KB');
    const voiceId = await elevenlabs.cloneVoice(name, audioBuffer);
    console.log('[Clone] 成功: ' + voiceId);

    const chars = storage.read('characters');
    if (chars[characterId]) {
      chars[characterId].voiceId = voiceId;
      delete chars[characterId].segments;
      storage.write('characters', chars);
    }
    res.json({ voiceId: voiceId });
  } catch (err) {
    console.error('[Clone Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** 获取片段列表 */
router.get('/segments/:characterId', (req, res) => {
  const owned = checkOwnership(req.params.characterId, req.user.userId);
  if (owned.error) return res.status(owned.status).json({ error: owned.error });
  res.json(owned.character.segments || []);
});

module.exports = router;
