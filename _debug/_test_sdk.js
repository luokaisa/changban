const d = require('@alicloud/dypnsapi20170525');
const req = new d.GetAuthorizationUrlRequest({
  schemeCode: 'FC220000013025071',
  phoneNo: '13800138000',
  endUrl: 'https://changban.xyz/phone-auth.html',
  type: 'H5',
});
console.log('Constructor keys:', Object.getOwnPropertyNames(req).filter(k => !k.startsWith('_')));
console.log('schemeCode:', req.schemeCode);
console.log('phoneNo:', req.phoneNo);
console.log('endUrl:', req.endUrl);
console.log('type:', req.type);
