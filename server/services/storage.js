// 简易 JSON 文件存储（不上数据库，轻量够用）
const fs = require('fs');
const path = require('path');
const config = require('../config');

function dbPath(collection) {
  return path.join(config.dataDir, `${collection}.json`);
}

function read(collection) {
  const file = dbPath(collection);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

function write(collection, data) {
  const file = dbPath(collection);
  if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { read, write };
