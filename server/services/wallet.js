// 心意豆钱包：1 元 = 10 豆，只进不出（不提现）
// 余额 wallets.json { userId: { balance } }，账本 bean_txns.json（数组）
const storage = require('./storage');

const readWallets = () => storage.read('wallets');
const writeWallets = (w) => storage.write('wallets', w);

function readTxns() {
  const t = storage.read('bean_txns');
  return Array.isArray(t) ? t : [];
}
function writeTxns(arr) {
  storage.write('bean_txns', arr.slice(-1000));
}

function logTxn(userId, type, amount, label) {
  const arr = readTxns();
  arr.push({
    id: 'TX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(),
    userId,
    type, // recharge | spend
    amount, // 豆，正数为入，负数为出
    label,
    at: Date.now(),
  });
  writeTxns(arr);
}

function getBalance(userId) {
  const w = readWallets()[userId];
  return (w && w.balance) || 0;
}

/** 充值发豆（回调/mock 确认时调用，幂等由订单状态保证） */
function addBeans(userId, beans, label) {
  const wallets = readWallets();
  const w = wallets[userId] || { balance: 0 };
  w.balance += beans;
  wallets[userId] = w;
  writeWallets(wallets);
  logTxn(userId, 'recharge', beans, label);
  return w.balance;
}

/** 消费扣豆：余额不足返回 null */
function spendBeans(userId, beans, label) {
  const wallets = readWallets();
  const w = wallets[userId] || { balance: 0 };
  if (w.balance < beans) return null;
  w.balance -= beans;
  wallets[userId] = w;
  writeWallets(wallets);
  logTxn(userId, 'spend', -beans, label);
  return w.balance;
}

function recentTxns(userId, n = 20) {
  return readTxns().filter((t) => t.userId === userId).slice(-n).reverse();
}

module.exports = { getBalance, addBeans, spendBeans, recentTxns };
