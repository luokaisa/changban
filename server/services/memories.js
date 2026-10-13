// 记忆点：回忆档案完整度
// 设计原则：涨的是"回忆的丰富度"，不是聊天量。
//  - 寄心意、补回忆、传照片、复刻声音 → 加分
//  - 单纯聊天条数 → 不加分（避免刷量诱导）

function getLog(char) {
  return Array.isArray(char.memoryLog) ? char.memoryLog : [];
}

/** 记一笔记忆点 */
function addPoints(char, { type, points, label }) {
  char.memoryPoints = (char.memoryPoints || 0) + points;
  char.memoryLog = getLog(char);
  char.memoryLog.push({ type, points, label, at: Date.now() });
  // 只保留最近 200 条明细
  if (char.memoryLog.length > 200) char.memoryLog = char.memoryLog.slice(-200);
  return char.memoryPoints;
}

/** 回忆完整度：多维度加权，上限 100% */
function completeness(char) {
  const log = getLog(char);
  const giftCount = log.filter(e => e.type === 'gift').length;
  const memoryCount = log.filter(e => e.type === 'memory').length + (char.memories ? 1 : 0);

  const dims = [
    {
      key: 'basic', label: '基本信息', weight: 10,
      score: (char.name ? 5 : 0) + (char.relationship ? 5 : 0),
    },
    {
      key: 'personality', label: '性格特点', weight: 15,
      score: !char.personality ? 0 : (char.personality.length >= 10 ? 15 : 8),
    },
    {
      key: 'memories', label: '共同回忆', weight: 25,
      score: Math.min(25, memoryCount * 5),
    },
    {
      key: 'voice', label: '声音复刻', weight: 20,
      score: char.voiceId ? 20 : 0,
    },
    {
      key: 'avatar', label: '照片', weight: 10,
      score: char.avatar ? 10 : 0,
    },
    {
      key: 'gifts', label: '心意时刻', weight: 20,
      score: Math.min(20, giftCount * 4),
    },
  ];
  const percent = dims.reduce((s, d) => s + d.score, 0);
  return { percent, points: char.memoryPoints || 0, dims };
}

/** 里程碑文案（温和，不做功能锁） */
function milestone(percent) {
  if (percent >= 100) return '回忆档案已完整，TA 会一直在你心里。';
  if (percent >= 60) return '回忆越来越丰满了，TA 的样子越来越清晰。';
  if (percent >= 30) return '已经留下了不少回忆，继续慢慢补充。';
  return '刚开始，一点一点把回忆留下来吧。';
}

module.exports = { addPoints, completeness, milestone, getLog };
