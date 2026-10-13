// 心意豆充值：微信支付 H5
// 1 元 = 10 心意豆，只进不出。心意用豆支付，不再直接人民币下单。
const express = require('express');
const router = express.Router();
const storage = require('../services/storage');
const wechatpay = require('../services/wechatpay');
const wallet = require('../services/wallet');

const payEnabled = () => process.env.GIFTS_PAY_ENABLED === 'true';

// 充值档位（cny 元 → beans 豆）
const RECHARGE_TIERS = [
  { id: 't6', cny: 6, beans: 60 },
  { id: 't30', cny: 30, beans: 300 },
  { id: 't68', cny: 68, beans: 680 },
  { id: 't128', cny: 128, beans: 1280 },
];

const readOrders = () => storage.read('orders');
const writeOrders = (o) => storage.write('orders', o);
const newOrderId = () =>
  'WX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();

/** 充值档位 + 钱包余额 */
router.get('/wallet', (req, res) => {
  res.json({
    balance: wallet.getBalance(req.user.userId),
    tiers: RECHARGE_TIERS,
    rate: '1 元 = 10 心意豆',
    payEnabled: payEnabled(),
    mock: wechatpay.isMock(),
    recent: wallet.recentTxns(req.user.userId, 10),
  });
});

/** 创建充值单 */
router.post('/create', async (req, res) => {
  try {
    if (!payEnabled()) return res.status(400).json({ error: '当前无需充值' });
    const tier = RECHARGE_TIERS.find((t) => t.id === req.body.tierId);
    if (!tier) return res.status(400).json({ error: '充值档位不存在' });

    const orders = readOrders();
    const orderId = newOrderId();
    orders[orderId] = {
      id: orderId,
      kind: 'recharge',
      userId: req.user.userId,
      tierId: tier.id,
      amount: tier.cny * 100, // 分，服务端档位为准
      beans: tier.beans,
      status: 'pending',
      createdAt: Date.now(),
    };
    writeOrders(orders);

    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || '127.0.0.1';
    const pay = await wechatpay.createH5Order({
      outTradeNo: orderId,
      description: `常伴-充值${tier.beans}心意豆`,
      totalFen: tier.cny * 100,
      clientIp,
    });
    res.json({ orderId, mock: pay.mock, h5_url: pay.h5_url, cny: tier.cny, beans: tier.beans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 发豆（幂等：只有 pending → paid 才发一次） */
function creditOrder(orderId) {
  const orders = readOrders();
  const order = orders[orderId];
  if (!order || order.status !== 'pending') return null;
  order.status = 'paid';
  order.paidAt = Date.now();
  writeOrders(orders);
  const balance = wallet.addBeans(order.userId, order.beans, `微信充值${order.beans}心意豆`);
  return { order, balance };
}

/** 查单（前端轮询；真钱模式自动向微信刷新，兜底回调丢失） */
router.get('/status/:orderId', async (req, res) => {
  const orders = readOrders();
  const order = orders[req.params.orderId];
  if (!order || order.userId !== req.user.userId) {
    return res.status(404).json({ error: '订单不存在' });
  }
  if (order.status === 'pending' && !wechatpay.isMock()) {
    try {
      const r = await wechatpay.queryOrder(order.id);
      if (r && r.trade_state === 'SUCCESS') creditOrder(order.id);
    } catch (e) { /* 查单失败则保持本地状态，前端继续轮询 */ }
  }
  const fresh = readOrders()[order.id];
  res.json({
    orderId: fresh.id,
    status: fresh.status,
    beans: fresh.beans,
    amount: fresh.amount,
    balance: wallet.getBalance(req.user.userId),
  });
});

/**
 * 微信支付结果回调
 * 安全策略：不信任回调体，以服务端持商户凭证向微信查单为准
 */
router.post('/notify', async (req, res) => {
  try {
    const body = req.body || {};
    const outTradeNo = body.out_trade_no || (body.resource && body.resource.out_trade_no);
    if (outTradeNo && !wechatpay.isMock()) {
      const r = await wechatpay.queryOrder(outTradeNo).catch(() => null);
      if (r && r.trade_state === 'SUCCESS') creditOrder(outTradeNo);
    }
    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (err) {
    res.status(500).json({ code: 'FAIL', message: err.message });
  }
});

/** mock 确认支付并发豆（仅测试模式） */
router.post('/mock-confirm', (req, res) => {
  if (!wechatpay.isMock()) return res.status(400).json({ error: '非测试模式' });
  const orders = readOrders();
  const order = orders[req.body.orderId];
  if (!order || order.userId !== req.user.userId) {
    return res.status(404).json({ error: '订单不存在' });
  }
  const result = creditOrder(order.id);
  if (!result) return res.status(400).json({ error: '订单已处理' });
  res.json({ ok: true, balance: result.balance });
});

module.exports = router;
