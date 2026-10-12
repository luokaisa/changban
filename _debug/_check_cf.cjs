const https = require('https');
https.get('https://changban.xyz/?t=' + Date.now(), res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Has 常伴:', d.includes('常伴'));
    console.log('Has 更改密码:', d.includes('更改密码'));
    console.log('Has 纪念人:', d.includes('纪念人'));
    console.log('Settings page-settings:', d.includes('page-settings'));
    console.log('Size:', d.length);
    // Check a few key strings
    ['更改密码', '常伴', '说明', 'AI 模型', '语音'].forEach(s => {
      console.log('  ' + s + ':', d.includes(s));
    });
  });
}).on('error', e => console.log('Error:', e.message));
