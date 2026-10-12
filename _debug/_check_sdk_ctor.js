const fs = require('fs');
const sdk = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\node_modules\\aliyun_numberauthsdk_web\\build\\numberAuth-web-sdk.js', 'utf8');

// Find the PhoneNumberServer class constructor
const idx = sdk.indexOf('PhoneNumberServer');
if (idx >= 0) {
  // Look at the PhoneNumberServer module (the one that has the default export)
  // Find the module definition pattern around it
  const ctx = sdk.substring(Math.max(0, idx - 2000), Math.min(sdk.length, idx + 3000));
  console.log(ctx);
}
