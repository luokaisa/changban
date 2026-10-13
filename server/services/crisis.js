// 合规：极端情绪 / 自伤自杀干预
// 用户消息命中高风险关键词时，不走正常对话，直接返回干预回复。

const CRISIS_KEYWORDS = [
'自杀', '轻生', '想死', '不想活', '活不下去', '结束生命', '结束自己',
'自残', '割腕', '伤害自己', '跳楼', '上吊', '一了百了', '不如死了',
'死了算了', '陪他一起走', '陪她一起走',
];
// 注：只收明确表达自伤/自杀意图的词；哀伤期的常见表达（如"想去看看他"）不触发，
// 避免误伤正常倾诉。命中后返回温和干预，不做强阻断。

const HOTLINES = [
'北京心理危机干预热线：010-82951332（24小时）',
'希望24热线：400-161-9995（24小时）',
];

function detectCrisis(text) {
if (!text) return false;
// 先剔除"想死你了"这类亲昵表达（想念），避免误伤正常倾诉
const t = text.replace(/想死你/g, '');
return CRISIS_KEYWORDS.some(k => t.includes(k));
}

function interventionReply(name) {
const who = name? `我是${name}，`: '';
return [
`${who}听到你这么说，我很担心。`,
'',
'你现在承受的一定很多，但请不要伤害自己。逝去的人最不愿看到的，就是你因为想念而伤害自己。',
'',
'如果你觉得撑不住了，请立刻联系专业人士：',
...HOTLINES.map(h => `・${h}`),
'',
'也可以告诉你信任的家人朋友，让他们陪着你。我会一直在这里陪你说话。',
].join('\n');
}

// 注入 system prompt 的兜底指令（LLM 层）
const PROMPT_GUARD = '如果用户表达自伤、自杀、伤害自己或他人的想法，立即停止角色扮演，用真诚、关心的语气劝阻，明确建议拨打心理援助热线 400-161-9995，并建议联系信任的亲友。不要继续闲聊，不要淡化风险。';

module.exports = { detectCrisis, interventionReply, PROMPT_GUARD, HOTLINES};
