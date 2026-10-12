const d = require('@alicloud/dypnsapi20170525');

// Check DescribeVerifySchemeResponseBodyModel
const m = new d.DescribeVerifySchemeResponseBodyModel();
console.log('Response body model fields:', Object.getOwnPropertyNames(m));

// Check SchemeQueryResultDTO
const dto = new d.DescribeVerifySchemeResponseBodySchemeQueryResultDTO();
console.log('DTO fields:', Object.getOwnPropertyNames(dto));
