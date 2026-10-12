const path = require('path');
const pkg = require(path.join(__dirname, 'node_modules/aliyun_numberauthsdk_web/package.json'));
console.log('Main:', pkg.main);

// Instead of trying to import the browser-only SDK in Node,
// let's use esbuild to understand its exports
const esbuild = require('esbuild');

async function check() {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'node_modules/aliyun_numberauthsdk_web', pkg.main)],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
  });
  
  // Check what's exported
  for (const [file, info] of Object.entries(result.metafile.outputs)) {
    console.log('\nOutput:', file);
    console.log('Exports:', info.exports);
    console.log('Size:', info.bytes);
  }
}

check().catch(console.error);
