const { execSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
try {
  const output = execSync('"' + ffmpegPath + '" -version', { stdio: 'pipe' });
  console.log('ffmpeg OK -', output.toString().split('\n')[0]);
} catch (e) {
  console.log('ffmpeg FAILED:', e.message.substring(0, 100));
}
