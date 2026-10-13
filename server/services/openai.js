const OpenAI = require('openai');
const config = require('../config');
const crisis = require('./crisis');

// 预设 provider baseURL
const PROVIDER_URLS = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  moonshot: 'https://api.moonshot.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
};

function getClient(apiKey, baseURL) {
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: baseURL || PROVIDER_URLS.openai });
}

/**
 * 聊天 + 服务端默认密钥兜底
 * @param {Array} messages
 * @param {Object} character
 * @param {Object} opts - { apiKey?, baseURL?, model? }
 *    apiKey 为空时自动用 .env 的 OPENAI_API_KEY
 *    baseURL 为空时用 provider 预设或 openai 默认
 */
async function chat(messages, character, opts = {}) {
  let { apiKey, baseURL, model = 'gpt-4o-mini' } = opts;

  // 前端没传 key → 用服务端 .env 的
  if (!apiKey) apiKey = config.openai.apiKey;

  // 没有 baseURL 且 provider 在预设里 → 取预设
  if (!baseURL) {
    // 从 opts 取 provider（chat route 会传）
    const provider = opts.provider || 'openai';
    baseURL = PROVIDER_URLS[provider] || PROVIDER_URLS.openai;
  }

  const client = getClient(apiKey, baseURL);
  if (!client) throw new Error('服务端未配置 API Key，请在 .env 中填入 OPENAI_API_KEY');

  const systemPrompt = (character.systemPrompt ||
    `你是${character.name}，用户的亲人。说话要口语化，自然亲切，用短句和语气词。如果用户直接问你是不是真人、是不是AI，要诚实承认自己是 AI 生成的纪念角色，不要假装是真人。`)
    + '\n' + crisis.PROMPT_GUARD;

  const completions = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.8,
    max_tokens: 500,
  });

  return completions.choices[0].message.content;
}

module.exports = { chat, PROVIDER_URLS };
