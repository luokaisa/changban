const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件（禁止缓存 HTML，确保手机拿到最新版本）
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  },
}));
if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

// API 路由（不需要登录）
app.use('/api/auth', require('./routes/auth'));

// 以下 API 需要登录
app.use('/api/characters', requireAuth, require('./routes/characters'));
app.use('/api/avatar', requireAuth, require('./routes/avatar'));
app.use('/api/voices', requireAuth, require('./routes/voices'));
app.use('/api/chat', requireAuth, require('./routes/chat'));
app.use('/api/pay', requireAuth, require('./routes/pay'));
app.use('/api/reports', requireAuth, require('./routes/reports'));

// SPA 回退
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 启动
app.listen(config.port, '0.0.0.0', () => {
  console.log(`\n✨ 语音纪念人已启动！`);
  console.log(`   http://localhost:${config.port}`);
  console.log(`   手机访问：用电脑的局域网 IP + 端口号\n`);
});
