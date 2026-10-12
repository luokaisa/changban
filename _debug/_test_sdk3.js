const d = require('@alicloud/dypnsapi20170525');
const req = new d.GetAuthorizationUrlRequest({
  phoneNo: '13800138000',
  schemeCode: 'FC220000013025071',
  endUrl: 'https://changban.xyz/phone-auth.html',
  type: 'H5',
});

// Check what toMap produces
console.log('toMap:', JSON.stringify(req.toMap(), null, 2));

// Try setting properties directly
const req2 = new d.GetAuthorizationUrlRequest({});
req2.phoneNo = '13800138000';
req2.schemeCode = 'FC220000013025071';
req2.endUrl = 'https://changban.xyz/phone-auth.html';
req2.type = 'H5';
console.log('req2 toMap:', JSON.stringify(req2.toMap(), null, 2));

// Check what validate says
try {
  req.validate();
  console.log('Validate: OK');
} catch(e) {
  console.log('Validate error:', e.message);
}
