import fs from 'fs';
const sdk = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\public\\assets\\numberAuth-web-sdk.js', 'utf8');

// Find getConfig usage (the endpoint, not the definition)
let idx = 0;
let count = 0;
while ((idx = sdk.indexOf('getConfig', idx)) >= 0 && count < 3) {
  const ctx = sdk.substring(Math.max(0, idx - 400), Math.min(sdk.length, idx + 400));
  // Skip the definition line
  if (!ctx.includes('"/queryAppConfig"') && !ctx.includes("'/queryAppConfig'")) {
    console.log(`\n=== getConfig usage ${++count} at ${idx} ===`);
    console.log(ctx);
  }
  idx += 1;
}
