const OpenApi = require('@alicloud/openapi-client');
const Dysmsapi = require('@alicloud/dypnsapi20170525');
const config = require('../config');
const crypto = require('crypto');
const https = require('https');

/**
 * 获取 H5 认证 URL
 * 使用 raw RPC 调用阿里云 API（SDK 的 GetAuthorizationUrlRequest 参数不全）
 */
async function getAuthUrl(schemeCode, callbackUrl, phoneNo) {
  const ak = config.aliyun?.accessKeyId;
  const sk = config.aliyun?.accessKeySecret;
  if (!ak || !sk) throw new Error('阿里云未配置');

  const apiParams = {
    Action: 'GetAuthorizationUrl',
    Format: 'JSON',
    Version: '2017-05-25',
    AccessKeyId: ak,
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: Math.random().toString(36).substring(2, 15),
    SchemeCode: schemeCode,
    Type: 'H5',
    EndUrl: callbackUrl,
  };
  if (phoneNo) apiParams.PhoneNo = phoneNo;

  // 计算签名
  const sortedKeys = Object.keys(apiParams).sort();
  const canonicalizedQuery = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(apiParams[k])}`)
    .join('&');
  const stringToSign = `POST&${encodeURIComponent('/')}&${encodeURIComponent(canonicalizedQuery)}`;
  const signature = crypto.createHmac('sha1', `${sk}&`).update(stringToSign).digest('base64');
  apiParams.Signature = signature;

  // 发送请求
  return new Promise((resolve, reject) => {
    const body = Object.entries(apiParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const options = {
      hostname: 'dypnsapi.aliyuncs.com',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.Code !== 'OK') {
            reject(new Error(result.Message || '获取认证URL失败'));
          } else {
            resolve(result.Data.Url);
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 用 spToken 换手机号（SDK 版，这部分 SDK 正常工作）
 */
async function getPhoneBySpToken(spToken) {
  const ak = config.aliyun?.accessKeyId;
  const sk = config.aliyun?.accessKeySecret;
  if (!ak || !sk) throw new Error('阿里云未配置');
  const cfg = new OpenApi.Config({
    accessKeyId: ak,
    accessKeySecret: sk,
    endpoint: 'dypnsapi.aliyuncs.com',
  });
  const client = new Dysmsapi.default(cfg);

  const authReq = new Dysmsapi.GetAuthTokenRequest({ spToken });
  const authRes = await client.getAuthToken(authReq);
  if (authRes.body.code !== 'OK') {
    throw new Error(authRes.body.message || '认证失败');
  }
  const accessToken = authRes.body.tokenInfo.accessToken;

  const phoneReq = new Dysmsapi.GetPhoneWithTokenRequest({ accessToken });
  const phoneRes = await client.getPhoneWithToken(phoneReq);
  if (phoneRes.body.code !== 'OK') {
    throw new Error(phoneRes.body.message || '获取手机号失败');
  }
  return phoneRes.body.phoneNum;
}

module.exports = { getAuthUrl, getPhoneBySpToken };
