// 举报与申诉：用户举报违规角色，管理员处理（驳回/下架）
// 下架 = character.disabled = true，各业务接口拦截（复用既有 disabled 字段）
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const storage = require('../services/storage');

function isAdmin(req) {
  return req.user && req.user.role === 'admin';
}

// 提交举报（登录用户）
router.post('/', (req, res) => {
  const { characterId, reason, detail } = req.body;
  if (!characterId || !reason) return res.status(400).json({ error: '请选择举报原因' });
  const allowed = ['未经授权', '冒充亲属', '有害内容', '诈骗嫌疑', '其他'];
  if (!allowed.includes(reason)) return res.status(400).json({ error: '举报原因无效' });

  // 被举报角色须存在（允许举报自己可见的任一角色；下架后不可重复举报）
  const chars = storage.read('characters');
  const target = chars[characterId];
  if (!target) return res.status(404).json({ error: '角色不存在' });
  if (target.disabled) return res.status(400).json({ error: '该角色已被下架' });

  const reports = storage.read('reports');
  // 同一用户对同一角色未处理的举报只保留一条
  const dup = Object.values(reports).find(r =>
    r.characterId === characterId && r.reporterId === req.user.userId && r.status === 'pending');
  if (dup) return res.status(400).json({ error: '你已举报过该角色，请等待处理' });

  const id = uuidv4().slice(0, 8);
  reports[id] = {
    id,
    characterId,
    characterName: target.name || '',
    ownerId: target.userId,
    reporterId: req.user.userId,
    reporterName: req.user.username,
    reason,
    detail: String(detail || '').slice(0, 500),
    status: 'pending', // pending | dismissed | takedown
    createdAt: Date.now(),
  };
  storage.write('reports', reports);
  res.json({ ok: true, id });
});

// 举报列表（管理员）
router.get('/', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: '无权访问' });
  const reports = storage.read('reports');
  const list = Object.values(reports).sort((a, b) => b.createdAt - a.createdAt);
  res.json(list);
});

// 处理举报（管理员）：dismiss 驳回 / takedown 下架
router.post('/:id/handle', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: '无权访问' });
  const { action, note } = req.body;
  if (!['dismiss', 'takedown'].includes(action)) return res.status(400).json({ error: '处理动作无效' });

  const reports = storage.read('reports');
  const r = reports[req.params.id];
  if (!r) return res.status(404).json({ error: '举报不存在' });
  if (r.status !== 'pending') return res.status(400).json({ error: '该举报已处理' });

  r.status = action === 'takedown' ? 'takedown' : 'dismissed';
  r.note = String(note || '').slice(0, 200);
  r.handledAt = Date.now();
  r.handledBy = req.user.username;

  if (action === 'takedown') {
    const chars = storage.read('characters');
    const c = chars[r.characterId];
    if (c && !c.disabled) {
      c.disabled = true;
      c.disabledAt = Date.now();
      c.disabledReason = r.reason;
      storage.write('characters', chars);
    }
  }
  storage.write('reports', reports);
  res.json({ ok: true, status: r.status });
});

module.exports = router;
