// 微信支付 H5（API v3，原生 crypto 签名，零新增依赖）
// WECHAT_MOCK=true（默认）时走模拟：不调微信接口，前端走应用内模拟支付
// 生产：WECHAT_MOCK=false 并填好下方 6 项配置
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

function cfg() {
  return {
    appid: process.env.WECHAT_APPID || '',
    mchid: process.env.WECHAT_MCHID || '',
    apiv3Key: process.env.WECHAT_APIV3_KEY || '',
    serialNo: process.env.WECHAT_SERIAL_NO || '',
    privateKeyPath: process.env.WECHAT_PRIVATE_KEY_PATH || '',
    notifyUrl: process.env.WECHAT_NOTIFY_URL || '',
  };
}

function isConfigured() {
  const c = cfg();
  return !!(c.appid && c.mchid && c.apiv3Key && c.serialNo && c.privateKeyPath);
}

function isMock() {
  return process.env.WECHAT_MOCK !== 'false' || !isConfigured();
}

/** v3 签名：WECHATPAY2-SHA256-RSA2048 */
function buildAuth(method, path, body) {
  const c = cfg();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const key = fs.readFileSync(c.privateKeyPath, 'utf8');
  const str = [method, path, timestamp, nonce, body, ''].join('\n');
  const signature = crypto.createSign('RSA-SHA256').update(str).sign(key, 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${c.mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${c.serialNo}"`;
}

function apiRequest(method, path, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : '';
    const options = {
      hostname: 'api.mch.weixin.qq.com',
      path,
      method,
      headers: {
        'Authorization': buildAuth(method, path, body),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { /* 非 JSON */ }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
        else reject(new Error(`微信支付接口 ${res.statusCode}: ${String(data).slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * 创建 H5 支付单
 * @returns { mock: true } 或 { mock: false, h5_url }
 */
async function createH5Order({ outTradeNo, description, totalFen, clientIp }) {
  if (isMock()) return { mock: true, h5_url: null };
  const c = cfg();
  const res = await apiRequest('POST', '/v3/pay/transactions/h5', {
    appid: c.appid,
    mchid: c.mchid,
    description,
    out_trade_no: outTradeNo,
    notify_url: c.notifyUrl,
    amount: { total: totalFen, currency: 'CNY' },
    scene_info: {
      payer_client_ip: clientIp || '127.0.0.1',
      h5_info: { type: 'Wap' },
    },
  });
  return { mock: false, h5_url: res && res.h5_url };
}

/** 商户单号查单（服务端权威状态） */
async function queryOrder(outTradeNo) {
  if (isMock()) return null;
  const c = cfg();
  return apiRequest('GET', `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${c.mchid}`, null);
}

module.exports = { isMock, isConfigured, createH5Order, queryOrder };
