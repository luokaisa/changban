import fs from 'fs';
const sdk = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\public\\assets\\numberAuth-sdk.bundle.js', 'utf8');

// Find the authPnsWeb call implementation
const idx = sdk.indexOf('authPnsWeb');
const before = sdk.substring(0, idx + 200);
// Find the function that calls it - search backwards for function/request patterns
const searchStart = Math.max(0, idx - 2000);
const searchEnd = Math.min(sdk.length, idx + 2000);
const relevant = sdk.substring(searchStart, searchEnd);

// Find where authPnsWeb is used in a request
const reqPatterns = ['getToken', 'request', 'ajax', 'fetch', '.post', '.get', 'action'];
reqPatterns.forEach(p => {
  const pidx = relevant.lastIndexOf(p);
  if (pidx >= 0) {
    const ctx = relevant.substring(Math.max(0, pidx - 100), Math.min(relevant.length, pidx + 200));
    console.log(`\n=== Near "${p}" ===`);
    console.log(ctx);
  }
});
