const express = require('express');
const router = express.Router();
const storage = require('../services/storage');
const { v4: uuidv4 } = require('uuid');

/** 获取当前用户的角色列表 */
router.get('/', (req, res) => {
  const chars = storage.read('characters');
  const list = Object.entries(chars)
    .filter(([_, c]) => c.userId === req.user.userId)
    .map(([id, c]) => ({
      id,
      name: c.name,
      relationship: c.relationship || '',
      voiceId: c.voiceId || '',
      hasAvatar: !!c.avatar,
      createdAt: c.createdAt,
    }));
  res.json(list);
});

/** 获取单个角色（仅限当前用户） */
router.get('/:id', (req, res) => {
  const chars = storage.read('characters');
  const char = chars[req.params.id];
  if (!char) return res.status(404).json({ error: '角色不存在' });
  if (char.userId !== req.user.userId) return res.status(403).json({ error: '无权访问该角色' });
  res.json({ id: req.params.id, ...char });
});

/** 创建角色（绑定到当前用户） */
router.post('/', (req, res) => {
  const { name, relationship, personality, memories } = req.body;
  if (!name) return res.status(400).json({ error: '请填写角色姓名' });

  const id = uuidv4().slice(0, 8);
  const chars = storage.read('characters');
  chars[id] = {
    id,
    userId: req.user.userId,
    name,
    relationship: relationship || '',
    personality: personality || '',
    memories: memories || '',
    dialect: req.body.dialect || '',
    voiceId: '',
    avatar: null,
    systemPrompt: generatePrompt({ name, relationship, personality, memories, dialect: req.body.dialect }),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  storage.write('characters', chars);
  res.json(chars[id]);
});

/** 更新角色（仅限拥有者） */
router.put('/:id', (req, res) => {
  const chars = storage.read('characters');
  const char = chars[req.params.id];
  if (!char) return res.status(404).json({ error: '角色不存在' });
  if (char.userId !== req.user.userId) return res.status(403).json({ error: '无权修改该角色' });

  const { name, relationship, personality, memories, voiceId } = req.body;
  if (name) char.name = name;
  if (relationship !== undefined) char.relationship = relationship;
  if (personality !== undefined) char.personality = personality;
  if (memories !== undefined) char.memories = memories;
  if (voiceId) char.voiceId = voiceId;
  if (req.body.dialect !== undefined) char.dialect = req.body.dialect;
  char.systemPrompt = generatePrompt(char);
  char.updatedAt = Date.now();

  storage.write('characters', chars);
  res.json(char);
});

/** 删除角色（仅限拥有者） */
router.delete('/:id', (req, res) => {
  const chars = storage.read('characters');
  if (!chars[req.params.id]) return res.status(404).json({ error: '角色不存在' });
  if (chars[req.params.id].userId !== req.user.userId) return res.status(403).json({ error: '无权删除该角色' });
  delete chars[req.params.id];
  storage.write('characters', chars);
  res.json({ success: true });
});

function generatePrompt(char) {
  const parts = [`你是${char.name}，用户的${char.relationship || '亲人'}。`];
  if (char.personality) parts.push(`性格特点：${char.personality}`);
  if (char.memories) parts.push(`共同回忆：${char.memories}`);
  if (char.dialect) parts.push(`请使用${char.dialect}进行对话。`);
  parts.push(`
【对话要求】
- 说话一定要口语化、自然，像平时聊天一样
- 用短句，带语气词（啊、呀、嘛、呗、哈、嗯）
- 可以唠叨、可以重复、可以有口头禅
- 偶尔可以有点小脾气、小抱怨，像个真人
- 不要写长句子，不要像朗诵
- 不要提你是AI
- 每句话最好不超过30个字
- 少用儿化音，说话自然一点`);
  return parts.join('\n');
}

module.exports = router;
