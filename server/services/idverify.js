// 合规：实名认证（二要素：姓名 + 身份证号一致性核验）
// 生产：阿里云市场身份证二要素 API（APPCODE 鉴权），按次收费
// 本地联调：IDVERIFY_MOCK=true 时只做格式校验，不调真实接口
//
// 生产接入步骤（FF 操作）：
//  1. 在阿里云市场购买「身份证二要素」类 API，拿到 接口 URL 与 APPCODE
//  2. 在 .env 填入：IDVERIFY_MOCK=false / IDVERIFY_URL=... / IDVERIFY_APPCODE=...
//  3. 重启服务
//
// 隐私：身份证号原文不落盘，只存脱敏号 + sha256（去重/审计用）

const crypto = require('crypto');

// 同一证件 60 秒冷却（防撞库刷接口）
const cooldown = new Map();
const COOLDOWN_MS = 60 * 1000;

function isMock() {
  return (process.env.IDVERIFY_MOCK || 'true').toLowerCase() !== 'false';
}

/** 18 位身份证格式校验（含校验位） */
function checkIdCardFormat(idcard) {
  if (!/^\d{17}[\dXx]$/.test(idcard)) return false;
  const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const c = '10X98765432';
  let s = 0;
  for (let i = 0; i < 17; i++) s += parseInt(idcard[i], 10) * w[i];
  return c[s % 11] === idcard[17].toUpperCase();
}

/** 从身份证号解析出生日期 -> 'YYYY-MM-DD'，非法返回 null */
function parseBirthdate(idcard) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(idcard.slice(6, 14));
  if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  const t = new Date(d + 'T00:00:00');
  if (isNaN(t.getTime()) || t.getTime() > Date.now()) return null;
  return d;
}

function parseSex(idcard) {
  const n = parseInt(idcard[16], 10);
  return isNaN(n) ? '' : (n % 2 === 1 ? '男' : '女');
}

function maskId(idcard) {
  return idcard.slice(0, 6) + '********' + idcard.slice(14);
}

function hashId(idcard) {
  return crypto.createHash('sha256').update('changban-idverify:' + idcard).digest('hex');
}

/**
 * 实名核验
 * @returns {Promise<{ok:boolean, message:string, birthdate?:string, sex?:string}>}
 */
async function verify(name, idcard) {
  name = (name || '').trim();
  idcard = (idcard || '').trim().toUpperCase();

  if (!name || name.length < 2 || name.length > 10) {
    return { ok: false, message: '请填写真实姓名' };
  }
  if (!checkIdCardFormat(idcard)) {
    return { ok: false, message: '身份证号格式不正确' };
  }

  const now = Date.now();
  const last = cooldown.get(idcard) || 0;
  if (now - last < COOLDOWN_MS) {
    return { ok: false, message: '操作太频繁，请稍后再试' };
  }
  cooldown.set(idcard, now);

  const birthdate = parseBirthdate(idcard);
  const sex = parseSex(idcard);

  // 本地联调模式：只做格式校验
  if (isMock()) {
    return { ok: true, message: 'mock 核验通过（本地联调模式）', birthdate, sex };
  }

  // 生产：调阿里云市场二要素接口
  const url = process.env.IDVERIFY_URL;
  const appcode = process.env.IDVERIFY_APPCODE;
  if (!url || !appcode) {
    return { ok: false, message: '实名服务未配置，请联系管理员' };
  }
  try {
    const qs = `name=${encodeURIComponent(name)}&idcard=${idcard}`;
    const res = await fetch(`${url}?${qs}`, {
      method: 'GET',
      headers: { Authorization: 'APPCODE ' + appcode },
    });
    const data = await res.json().catch(() => ({}));
    // 兼容常见返回：业务 code 0=匹配；部分网关包一层 data
    const biz = data.data || data;
    const code = biz.code ?? biz.ret_code;
    if (String(code) === '0') {
      return { ok: true, message: '实名认证通过', birthdate: biz.birthday || birthdate, sex: biz.sex || sex };
    }
    const msgMap = { 1: '姓名与身份证号不匹配', 2: '无此身份证号', 12: '身份证号不合法' };
    return { ok: false, message: msgMap[code] || biz.msg || '实名认证未通过' };
  } catch (err) {
    console.error('实名核验接口异常:', err.message);
    return { ok: false, message: '实名服务暂时不可用，请稍后再试' };
  }
}

module.exports = { verify, checkIdCardFormat, parseBirthdate, parseSex, maskId, hashId, isMock };
