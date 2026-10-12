const fs = require('fs');
const sdk = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\node_modules\\aliyun_numberauthsdk_web\\build\\numberAuth-web-sdk.js', 'utf8');

// Check for PhoneNumberServer in the module exports
const idx = sdk.indexOf('PhoneNumberServer');
if (idx >= 0) {
  const ctx = sdk.substring(Math.max(0, idx - 100), Math.min(sdk.length, idx + 200));
  console.log('PhoneNumberServer found at', idx);
  console.log('Context:', ctx);
} else {
  console.log('PhoneNumberServer NOT FOUND in npm package SDK');
}

// Also check the asset version
const sdk2 = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\public\\assets\\numberAuth-web-sdk.js', 'utf8');
const idx2 = sdk2.indexOf('PhoneNumberServer');
if (idx2 >= 0) {
  console.log('\nPhoneNumberServer found in ASSET at', idx2);
  const ctx2 = sdk2.substring(Math.max(0, idx2 - 100), Math.min(sdk2.length, idx2 + 200));
  console.log('Context:', ctx2);
} else {
  console.log('\nPhoneNumberServer NOT FOUND in asset version');
}
