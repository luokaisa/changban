const sdk = require('aliyun_numberauthsdk_web');
console.log('Type:', typeof sdk);
console.log('Keys:', Object.keys(sdk).slice(0, 30));
if (typeof sdk === 'function') {
  console.log('Is class/function, checking static methods:', Object.getOwnPropertyNames(sdk).slice(0, 20));
}
