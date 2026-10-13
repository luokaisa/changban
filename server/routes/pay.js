// 微信支付：下单 / 查单 / 回调 / mock 确认
const express = require('express');
const router = express.Router();
const storage = require('../services/storage');
const gifts = require('../services/gifts');
const wechatpay = require('../services/wechatpay');

const payEnabled = () => process.env.GIFTS_PAY_ENABLED === 'true';
const readOrders = () => storage.read('orders');
const writeOrders = (o) => storage.write('orders', o);
const newOrderId = () =>
  'WX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();

/** 创建支付单 */
router.post('/create', async (req, res) => {
  try {
    if (!payEnabled()) return res.status(400).json({ error: '当前心意免费，无需支付' });
    const { characterId, giftId } = req.body;
    const gift = gifts.getGift(giftId);
    if (!gift || !gift.price) return res.status(400).json({ error: '该心意免费或不存在' });

    const chars = storage.read('characters');
    const character = chars[characterId];
    if (!character || character.userId !== req.user.userId) {
      return res.status(403).json({ error: '无权操作该角色' });
    }

    const orders = readOrders();
    const orderId = newOrderId();
    orders[orderId] = {
      id: orderId,
      userId: req.user.userId,
      characterId,
      giftId: gift.id,
      giftName: gift.name,
      amount: gift.price, // 分，服务端目录价为准
      status: 'pending',
      createdAt: Date.now(),
    };
    writeOrders(orders);

    const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || '127.0.0.1';
    const pay = await wechatpay.createH5Order({
      outTradeNo: orderId,
      description: `常伴-寄心意:${gift.name}`,
      totalFen: gift.price,
      clientIp,
    });
    res.json({ orderId, mock: pay.mock, h5_url: pay.h5_url, amount: gift.price });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** 查单（前端轮询；真钱模式自动向微信刷新状态，兜底回调丢失） */
router.get('/status/:orderId', async (req, res) => {
  const orders = readOrders();
  const order = orders[req.params.orderId];
  if (!order || order.userId !== req.user.userId) {
    return res.status(404).json({ error: '订单不存在' });
  }
  if (order.status === 'pending' && !wechatpay.isMock()) {
    try {
      const r = await wechatpay.queryOrder(order.id);
      if (r && r.trade_state === 'SUCCESS') {
        order.status = 'paid';
        order.paidAt = Date.now();
        writeOrders(orders);
      }
    } catch (e) { /* 查单失败则保持本地状态，前端继续轮询 */ }
  }
  res.json({
    orderId: order.id,
    status: order.status,
    giftId: order.giftId,
    characterId: order.characterId,
    amount: order.amount,
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
      if (r && r.trade_state === 'SUCCESS') {
        const orders = readOrders();
        const order = orders[outTradeNo];
        if (order && order.status === 'pending') {
          order.status = 'paid';
          order.paidAt = Date.now();
          writeOrders(orders);
        }
      }
    }
    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (err) {
    res.status(500).json({ code: 'FAIL', message: err.message });
  }
});

/** mock 确认支付（仅测试模式） */
router.post('/mock-confirm', (req, res) => {
  if (!wechatpay.isMock()) return res.status(400).json({ error: '非测试模式' });
  const orders = readOrders();
  const order = orders[req.body.orderId];
  if (!order || order.userId !== req.user.userId) {
    return res.status(404).json({ error: '订单不存在' });
  }
  order.status = 'paid';
  order.paidAt = Date.now();
  writeOrders(orders);
  res.json({ ok: true });
});

module.exports = router;
