const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const storage = require('../services/storage');
const crisis = require('../services/crisis');
const openai = require('../services/openai');
const gifts = require('../services/gifts');
const memories = require('../services/memories');
const wallet = require('../services/wallet');
const tts = require('../services/tts');
const { generatePrompt, PROMPT_VERSION } = require('./characters');
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
  res.json({ payEnabled: giftPayEnabled(), list: gifts.listGifts() });
});

/** TTS 合成回复语音（复用） */
/** TTS 前处理：把模型输出的"…"停顿标记加重，引擎会读出更明显的停顿 */
function emphasizePauses(text) {
  return text
    .replace(/…{3,}/g, '……')   // 归一化
    .replace(/…(?!…)/g, '…… '); // 单个 … → 双 … 加空格，停顿更长
}

async function ttsReply(character, reply) {
  if (!character.voiceId) return null;
  try {
    const audioBuffer = await tts.synthesize(
      emphasizePauses(reply), character.voiceId, { dialect: character.dialect }
    );
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

/** 老角色 prompt 自动升级到新版（聊一次即生效） */
function ensurePrompt(character, chars) {
  if (character.promptVersion !== PROMPT_VERSION) {
    character.systemPrompt = generatePrompt(character);
    character.promptVersion = PROMPT_VERSION;
    storage.write('characters', chars);
  }
}

const giftPayEnabled = () => process.env.GIFTS_PAY_ENABLED === 'true';

/** 初见问候：穿越后 TA 的第一句话（含语音），记为对话首条 */
router.post('/:characterId/greet', async (req, res) => {
  try {
    const chars = storage.read('characters');
    const character = chars[req.params.characterId];
    if (!character || character.disabled) return res.status(404).json({ error: '角色不存在' });
    if (character.userId !== req.user.userId) return res.status(403).json({ error: '无权使用该角色' });
    ensurePrompt(character, chars);

    const scoped = {
      ...character,
      systemPrompt: (character.systemPrompt || '') +
        '\n【初见】这是你和用户的初次重逢。把压在心底的想念说出来：可以哽咽、可以欲言又止（用"…"表示停顿），轻轻唤用户一声。2-3句短句，真情实感，不要端着。不要提系统，不要提你是AI。',
    };
    const reply = await openai.chat(
      [{ role: 'user', content: '（初次见面）' }], scoped, llmOpts(req)
    );
    addMessage(req.user.userId, req.params.characterId, 'assistant', reply);
    const audioUrl = await ttsReply(character, reply);
    res.json({ reply, audioUrl, character: { name: character.name, avatar: character.avatar } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 告别语：回到现实前 TA 的最后一句话（含语音） */
router.post('/:characterId/farewell', async (req, res) => {
  try {
    const chars = storage.read('characters');
    const character = chars[req.params.characterId];
    if (!character || character.disabled) return res.status(404).json({ error: '角色不存在' });
    if (character.userId !== req.user.userId) return res.status(403).json({ error: '无权使用该角色' });
    ensurePrompt(character, chars);

    const scoped = {
      ...character,
      systemPrompt: (character.systemPrompt || '') +
        '\n【告别】这是分别的时刻。温暖、释然，告诉用户你会一直在TA心里，叮嘱TA好好吃饭、好好生活，2-3句短句。不要提系统，不要提你是AI。',
    };
    const history = getHistory(req.user.userId, req.params.characterId);
    const reply = await openai.chat(history, scoped, llmOpts(req));
    addMessage(req.user.userId, req.params.characterId, 'assistant', reply);
    const audioUrl = await ttsReply(character, reply);
    res.json({ reply, audioUrl, character: { name: character.name, avatar: character.avatar } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 发货：心意消息落库 → 专属回应 → 语音 → 记点 */
async function deliverGift(userId, characterId, character, gift, chars, req) {
  ensurePrompt(character, chars);
  const giftMsg = `送给你：${gift.emoji}${gift.name}`;
  addMessage(userId, characterId, 'user', giftMsg);

  // 专属回应：人设 + 心意场景（不污染原 systemPrompt）
  const scoped = {
    ...character,
    systemPrompt: (character.systemPrompt || '') + '\n【寄心意】' + gift.scene,
  };
  const history = getHistory(userId, characterId);
  const reply = await openai.chat(history, scoped, llmOpts(req));
  addMessage(userId, characterId, 'assistant', reply);

  const audioUrl = await ttsReply(character, reply);

  // 记点 + 完整度
  const totalPoints = memories.addPoints(character, {
    type: 'gift', points: gift.points, label: `${gift.emoji}${gift.name}`,
  });
  storage.write('characters', chars);
  const comp = memories.completeness(character);

  return {
    reply,
    audioUrl,
    gift: { id: gift.id, name: gift.name, emoji: gift.emoji },
    pointsEarned: gift.points,
    totalPoints,
    completeness: comp.percent,
    milestone: memories.milestone(comp.percent),
    character: { name: character.name, avatar: character.avatar },
  };
}

/** 寄心意 → （付费心意扣豆） → 专属回应 + 语音 + 记点 */
router.post('/:characterId/gift', async (req, res) => {
  try {
    const { giftId } = req.body;
    const gift = gifts.getGift(giftId);
    if (!gift) return res.status(400).json({ error: '心意不存在' });

    const chars = storage.read('characters');
    const character = chars[req.params.characterId];
    if (!character || character.disabled) return res.status(404).json({ error: '角色不存在' });
    if (character.userId !== req.user.userId) return res.status(403).json({ error: '无权使用该角色' });

    // 付费心意：扣心意豆，余额不足引导充值（豆价以服务端目录为准）
    let beanCost = 0;
    if (giftPayEnabled() && gift.beanPrice > 0) {
      beanCost = gift.beanPrice;
      const balance = wallet.getBalance(req.user.userId);
      if (balance < beanCost) {
        return res.status(402).json({
          needRecharge: true,
          balance,
          gift: { id: gift.id, name: gift.name, emoji: gift.emoji, beanPrice: beanCost },
        });
      }
    }

    const result = await deliverGift(req.user.userId, req.params.characterId, character, gift, chars, req);

    // 发货成功后才扣豆（失败不扣，可重试）
    if (beanCost > 0) {
      const balance = wallet.spendBeans(
        req.user.userId, beanCost, `寄心意:${gift.name}`, req.params.characterId
      );
      result.beanBalance = balance;
    }
    res.json(result);
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
    if (!character || character.disabled) return res.status(404).json({ error: '角色不存在' });
    if (character.userId !== req.user.userId) return res.status(403).json({ error: '无权使用该角色' });

    const userId = req.user.userId;
    ensurePrompt(character, chars);
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
