import fs from 'fs';
const sdk = fs.readFileSync('C:\\Users\\<原开发者>\\.openclaw\\workspace\\changban\\public\\assets\\numberAuth-web-sdk.js', 'utf8');

// This is the standalone SDK (not bundled)
// Its UMD wrapper assigns exports to window when loaded as <script>
// Let's find what it exports by looking at the factory function return
const factoryEnd = sdk.lastIndexOf('return ');
if (factoryEnd > 0) {
  const endSection = sdk.substring(factoryEnd, Math.min(sdk.length, factoryEnd + 5000));
  console.log('=== Factory return section ===');
  console.log(endSection);
}
