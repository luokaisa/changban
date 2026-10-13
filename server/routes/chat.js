const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const storage = require('../services/storage');
const crisis = require('../services/crisis');
const openai = require('../services/openai');
const elevenlabs = require('../services/elevenlabs');
const gifts = require('../services/gifts');
const memories = require('../services/memories');
const config = require('../config');

const MAX_AUDIO_FILES = 50;      // TTS 回复音频最多保留份数
const SPLIT_PREVIEW_TTL = 7 * 24 * 3600 * 1000;  // 切片预览 7 天过期

/** 清理策略：TTS 音频只留最新 50 个；split 预览超 7 天删除 */
function pruneAudioFiles() {
  const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
  try {
    const audios = fs.readdirSync(uploadsDir)
      .filter(f => /^audio_\d+\.mp3$/.test(f))
      .map(f => ({ f, mtime: fs.statSync(path.join(uploadsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { f } of audios.slice(MAX_AUDIO_FILES)) {
      try { fs.unlinkSync(path.join(uploadsDir, f)); } catch {}
    }
  } catch {}
  try {
    const splitDir = path.join(uploadsDir, 'split');
    const cutoff = Date.now() - SPLIT_PREVIEW_TTL;
    for (const f of fs.readdirSync(splitDir)) {
      const p = path.join(splitDir, f);
      try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch {}
    }
  } catch {}
}

// 启动时清理一次历史积压
pruneAudioFiles();

// 对话历史按用户隔离: { userId_charId: [messages] }
// 持久化到 data/conversations.json，进程重启不丢失
const MAX_HISTORY = 200;

let conversations = storage.read('conversations');
// 启动时裁剪超长历史，防止文件无限膨胀
for (const key of Object.keys(conversations)) {
  if (Array.isArray(conversations[key]) && conversations[key].length > MAX_HISTORY) {
    conversations[key] = conversations[key].slice(-MAX_HISTORY);
  }
}

function saveConversations() {
  try {
    storage.write('conversations', conversations);
  } catch (err) {
    console.error('对话持久化失败:', err.message);
  }
}

function getKey(userId, characterId) {
  return `${userId}_${characterId}`;
}

/** 心意目录（必须在 /:characterId 之前定义） */
router.get('/gifts', (req, res) => {
  res.json(gifts.listGifts());
});

/** TTS 合成回复语音（复用） */
async function ttsReply(character, reply) {
  if (!character.voiceId) return null;
  try {
    const audioBuffer = await elevenlabs.textToSpeech(reply, character.voiceId);
    const audioFile = `audio_${Date.now()}.mp3`;
    const audioPath = path.join(__dirname, '..', '..', 'public', 'uploads', audioFile);
    fs.writeFileSync(audioPath, audioBuffer);
    pruneAudioFiles();
    return `/uploads/${audioFile}`;
  } catch (ttsErr) {
    console.error('TTS 失败:', ttsErr.message);
    return null;
  }
}

function llmOpts(req) {
  return {
    apiKey: req.headers['x-llm-key'] || config.openai.apiKey,
    provider: req.headers['x-llm-provider'] || 'deepseek',
    model: req.headers['x-llm-model'] || 'deepseek-chat',
    baseURL: (req.headers['x-llm-provider'] || 'deepseek') === 'custom' ? (req.headers['x-llm-baseurl'] || '') : '',
  };
}

/** 寄心意 → 专属回应 + 语音 + 记点 */
router.post('/:characterId/gift', async (req, res) => {
  try {
    const { giftId } = req.body;
    const gift = gifts.getGift(giftId);
    if (!gift) return res.status(400).json({ error: '心意不存在' });

    const chars = storage.read('characters');
    const character = chars[req.params.characterId];
    if (!character || character.disabled) return res.status(404).json({ error: '角色不存在' });
    if (character.userId !== req.user.userId) return res.status(403).json({ error: '无权使用该角色' });

    const userId = req.user.userId;
    const giftMsg = `送给你：${gift.emoji}${gift.name}`;
    addMessage(userId, req.params.characterId, 'user', giftMsg);

    // 专属回应：人设 + 心意场景（不污染原 systemPrompt）
    const scoped = {
      ...character,
      systemPrompt: (character.systemPrompt || '') + '\n【寄心意】' + gift.scene,
    };
    const history = getHistory(userId, req.params.characterId);
    const reply = await openai.chat(history, scoped, llmOpts(req));
    addMessage(userId, req.params.characterId, 'assistant', reply);

    const audioUrl = await ttsReply(character, reply);

    // 记点 + 完整度
    const totalPoints = memories.addPoints(character, {
      type: 'gift', points: gift.points, label: `${gift.emoji}${gift.name}`,
    });
    storage.write('characters', chars);
    const comp = memories.completeness(character);

    res.json({
      reply,
      audioUrl,
      gift: { id: gift.id, name: gift.name, emoji: gift.emoji },
      pointsEarned: gift.points,
      totalPoints,
      completeness: comp.percent,
      milestone: memories.milestone(comp.percent),
      character: { name: character.name, avatar: character.avatar },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getHistory(userId, characterId, limit = 50) {
  const key = getKey(userId, characterId);
  if (!conversations[key]) conversations[key] = [];
  return conversations[key].slice(-limit);
}

function addMessage(userId, characterId, role, content) {
  const key = getKey(userId, characterId);
  if (!conversations[key]) conversations[key] = [];
  conversations[key].push({ role, content });
  if (conversations[key].length > MAX_HISTORY) {
    conversations[key] = conversations[key].slice(-MAX_HISTORY);
  }
  saveConversations();
}

/** 发送消息 → AI 回复 + 语音 */
router.post('/:characterId', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: '请输入消息' });

    const chars = storage.read('characters');
    const character = chars[req.params.characterId];
    if (!character) return res.status(404).json({ error: '角色不存在' });
    if (character.userId !== req.user.userId) return res.status(403).json({ error: '无权使用该角色' });

    const userId = req.user.userId;
    addMessage(userId, req.params.characterId, 'user', message);

    // ===== 合规：极端情绪干预（先于 LLM，命中则直接返回干预回复） =====
    if (crisis.detectCrisis(message)) {
      const reply = crisis.interventionReply(character.name);
      addMessage(userId, req.params.characterId, 'assistant', reply);
      return res.json({ reply, audioUrl: null, crisis: true, character: { name: character.name, avatar: character.avatar } });
    }

    const history = getHistory(userId, req.params.characterId);

    // ===== LLM 调用（优先前端传的 Key，没有就用 .env 的） =====
    const reply = await openai.chat(history, character, llmOpts(req));
    addMessage(userId, req.params.characterId, 'assistant', reply);

    // ===== TTS 语音 =====
    const audioUrl = await ttsReply(character, reply);

    res.json({ reply, audioUrl, character: { name: character.name, avatar: character.avatar } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 清除历史（仅限当前用户） */
router.delete('/:characterId', (req, res) => {
  const key = getKey(req.user.userId, req.params.characterId);
  delete conversations[key];
  saveConversations();
  res.json({ success: true });
});

/** 支持的 LLM 列表 */
router.get('/providers', (req, res) => {
  res.json([
    { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o-mini' },
    { id: 'deepseek', name: 'DeepSeek（推荐，便宜中文好）', defaultModel: 'deepseek-chat' },
    { id: 'moonshot', name: '月之暗面 Moonshot', defaultModel: 'moonshot-v1-8k' },
    { id: 'qwen', name: '通义千问', defaultModel: 'qwen-turbo' },
    { id: 'glm', name: '智谱 GLM', defaultModel: 'glm-4-flash' },
    { id: 'custom', name: '自定义（Ollama 本地等）', defaultModel: '' },
  ]);
});

module.exports = router;
