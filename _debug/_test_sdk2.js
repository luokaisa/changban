const d = require('@alicloud/dypnsapi20170525');
console.log('Exports:', Object.keys(d));
console.log('GetAuthorizationUrlRequest:', d.GetAuthorizationUrlRequest ? 'yes' : 'no');

// Check if there are other request models
const req = new d.GetAuthorizationUrlRequest({});
const proto = Object.getPrototypeOf(req);
console.log('Proto keys:', Object.getOwnPropertyNames(proto).filter(k => !k.startsWith('_')));
console.log('Proto proto keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(proto)).filter(k => !k.startsWith('_')));
