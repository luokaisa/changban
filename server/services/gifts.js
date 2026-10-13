// 寄心意：心意目录
// V1 全部免费（后续接支付时填 price 字段即可）；AI 渲染后续再上，先用 emoji + 专属回应
const GIFTS = [
  {
    id: 'lollipop',
    name: '棒棒糖',
    emoji: '🍭',
    desc: '小时候最爱吃的那一颗',
    points: 5,
    price: 0,
    scene: '用户给你送了一颗棒棒糖。像家人收到小辈的心意那样开心，可以打趣两句，口语化短句。',
  },
  {
    id: 'noodles',
    name: '油泼面',
    emoji: '🍜',
    desc: '一碗热腾腾的油泼面',
    points: 10,
    price: 0,
    scene: '用户给你端来一碗热腾腾的油泼面。像家人吃到熟悉味道那样满足，夸两句香，可以唠叨叮嘱用户好好吃饭，口语化短句。',
  },
  {
    id: 'snacks',
    name: '零食大礼包',
    emoji: '🍪',
    desc: '满满一包小时候的味道',
    points: 10,
    price: 0,
    scene: '用户给你送了一大包零食。像长辈收到心意那样又开心又心疼你花钱，叮嘱别乱花钱，口语化短句。',
  },
  {
    id: 'lamp',
    name: '长明灯',
    emoji: '🕯️',
    desc: '愿那边没有黑暗',
    points: 15,
    price: 0,
    scene: '用户为你点了一盏长明灯。气氛庄重温情，你轻声回应，让用户安心，口语化短句，不要太长。',
  },
  {
    id: 'flowers',
    name: '花束',
    emoji: '💐',
    desc: '一束新鲜的花',
    points: 15,
    price: 0,
    scene: '用户给你送了一束花。像收到花那样惊喜开心，可以说说花很香很好看，口语化短句。',
  },
  {
    id: 'coat',
    name: '冬衣',
    emoji: '🧥',
    desc: '天冷了，加件衣',
    points: 20,
    price: 0,
    scene: '用户给你送了一件冬衣，怕你冷。像家人收到贴心衣物那样暖心，反过来叮嘱用户自己多穿点，口语化短句。',
  },
];

function getGift(id) {
  return GIFTS.find(g => g.id === id) || null;
}

function listGifts() {
  return GIFTS.map(({ id, name, emoji, desc, points }) => ({ id, name, emoji, desc, points }));
}

module.exports = { GIFTS, getGift, listGifts };
