const Dysmsapi = require('@alicloud/dypnsapi20170525');
const OpenApi = require('@alicloud/openapi-client');
const config = require('../config');
const crypto = require('crypto');

/**
 * 获取 H5 访问令牌（调用阿里云 PNS 接口）
 * 返回 SDK 初始化所需的 accessToken + jwtToken
 */
async function getH5AccessToken(schemeCode) {
  const ak = config.aliyun?.accessKeyId;
  const sk = config.aliyun?.accessKeySecret;
  if (!ak || !sk) throw new Error('阿里云未配置');

  // 方案1: 调用阿里云 CreateVerifyScheme 获取方案配置
  const cfg = new OpenApi.Config({
    accessKeyId: ak,
    accessKeySecret: sk,
    endpoint: 'dypnsapi.aliyuncs.com',
  });
  const client = new Dysmsapi.default(cfg);

  // 查看方案配置
  try {
    const descReq = new Dysmsapi.DescribeVerifySchemeRequest({
      schemeCode: schemeCode,
    });
    const descRes = await client.describeVerifyScheme(descReq);
    console.log('DescribeVerifyScheme:', JSON.stringify(descRes.body, null, 2));
    if (descRes.body.code === 'OK') {
      return {
        accessToken: descRes.body.schemeQueryResultDTO?.encryptToken || '',
        jwtToken: descRes.body.schemeQueryResultDTO?.customerKey || '',
      };
    }
  } catch (e) {
    console.log('DescribeVerifyScheme error:', e.message);
  }

  throw new Error('获取 H5 令牌失败');
}

module.exports = { getH5AccessToken };
