const fs = require('fs');
const sdk = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\node_modules\\aliyun_numberauthsdk_web\\build\\numberAuth-web-sdk.js', 'utf8');

// Find if there's a PhoneNumberServer constructor/init pattern  
const patterns = ['PhoneNumberServer.prototype', 'this.schemeCode', 'appKey', 'initConfig', '.init(', 'setConfig', 'config.scheme'];

patterns.forEach(p => {
  let idx = 0;
  while ((idx = sdk.indexOf(p, idx)) >= 0) {
    const ctx = sdk.substring(Math.max(0, idx - 80), Math.min(sdk.length, idx + 180));
    console.log(`\n=== ${p} at ${idx} ===`);
    console.log(ctx);
    idx += 1;
  }
});
