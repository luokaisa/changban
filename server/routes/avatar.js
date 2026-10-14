const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const storage = require('../services/storage');

const avatarUpload = multer({
  dest: config.uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JPG/PNG/GIF/WEBP 格式图片'));
    }
  },
});

/** 上传角色头像 */
router.post('/:id', avatarUpload.single('avatar'), (req, res) => {
  const chars = storage.read('characters');
  const char = chars[req.params.id];
  if (!char) {
    // 清理上传的文件
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: '角色不存在' });
  }
  if (char.disabled) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: '该角色已被下架' });
  }
  if (char.userId !== req.user.userId) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: '无权操作该角色' });
  }

  const ext = path.extname(req.file.originalname);
  const filename = `avatar_${req.params.id}${ext}`;
  const destPath = path.join(config.uploadsDir, filename);
  fs.renameSync(req.file.path, destPath);

  char.avatar = `/uploads/${filename}`;
  storage.write('characters', chars);
  res.json({ avatar: char.avatar });
});

/** 获取角色头像 */
router.get('/:id', (req, res) => {
  const chars = storage.read('characters');
  const char = chars[req.params.id];
  if (!char || !char.avatar) return res.status(404).json({ error: '无头像' });
  res.sendFile(path.join(__dirname, '..', '..', 'public', char.avatar));
});

module.exports = router;
