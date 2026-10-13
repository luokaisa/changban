const express = require('express');
const router = express.Router();
const storage = require('../services/storage');
const memories = require('../services/memories');
const wallet = require('../services/wallet');
const { v4: uuidv4 } = require('uuid');

/** 获取当前用户的角色列表（含记忆点/完整度） */
router.get('/', (req, res) => {
  const chars = storage.read('characters');
  const list = Object.entries(chars)
    .filter(([_, c]) => c.userId === req.user.userId)
    .map(([id, c]) => {
      const comp = memories.completeness(c);
      return {
        id,
        name: c.name,
        relationship: c.relationship || '',
        voiceId: c.voiceId || '',
        hasAvatar: !!c.avatar,
        memoryPoints: comp.points,
        completeness: comp.percent,
        createdAt: c.createdAt,
      };
    });
  res.json(list);
});

/** 回忆档案详情：完整度 + 记忆点明细 */
router.get('/:id/memories', (req, res) => {
  const chars = storage.read('characters');
  const char = chars[req.params.id];
  if (!char) return res.status(404).json({ error: '角色不存在' });
  if (char.userId !== req.user.userId) return res.status(403).json({ error: '无权访问该角色' });
  const comp = memories.completeness(char);
  res.json({
    ...comp,
    milestone: memories.milestone(comp.percent),
    log: memories.getLog(char).slice(-50).reverse(),
  });
});

/**
 * 角色消费统计（为"告别返还"打基础）
 * beansSpent: 该角色累计消费豆；cnyValue: 按 1元=10豆 折算；
 * refundable50: 50% 返还参考额（元，正式上线前需财务测算定档）
 */
router.get('/:id/spending', (req, res) => {
  const chars = storage.read('characters');
  const char = chars[req.params.id];
  if (!char) return res.status(404).json({ error: '角色不存在' });
  if (char.userId !== req.user.userId) return res.status(403).json({ error: '无权访问该角色' });
  const beansSpent = wallet.spentOnCharacter(req.user.userId, req.params.id);
  const cnyValue = beansSpent / 10;
  res.json({
    beansSpent,
    cnyValue: Math.round(cnyValue * 100) / 100,
    refundable50: Math.round(cnyValue * 0.5 * 100) / 100,
  });
});

/** 获取单个角色（仅限当前用户） */
router.get('/:id', (req, res) => {
  const chars = storage.read('characters');
  const char = chars[req.params.id];
  if (!char) return res.status(404).json({ error: '角色不存在' });
  if (char.userId !== req.user.userId) return res.status(403).json({ error: '无权访问该角色' });
  res.json({ id: req.params.id, ...char });
});

/** 创建角色（绑定到当前用户；需实名认证 + 逝者授权声明） */
router.post('/', (req, res) => {
  const { name, relationship, personality, memories } = req.body;
  if (!name) return res.status(400).json({ error: '请填写角色姓名' });
  // 合规：未实名用户不得创建 AI 纪念角色（含老账号、一键登录自动注册账号）
  const users = storage.read('users');
  const me = users[req.user.username];
  if (!me || me.verified !== true) {
    return res.status(403).json({ error: '请先完成实名认证', needVerify: true });
  }
  // 合规：创建 AI 纪念角色须确认已获得逝者生前意愿或全体近亲属一致书面同意
  if (req.body.consent !== true) {
    return res.status(403).json({ error: '请先确认逝者授权声明' });
  }

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
    consentAt: Date.now(), // 授权声明确认时间（合规留存）
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
- 如果用户直接问你是不是真人、是不是AI，要诚实承认：你是 AI 技术生成的纪念角色，不是真人，不要假装、不要否认
- 每句话最好不超过30个字
- 少用儿化音，说话自然一点`);
  return parts.join('\n');
}

module.exports = router;
