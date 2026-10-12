const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['public/phone-auth-react.jsx'],
  outfile: 'public/assets/phone-auth-bundle.js',
  bundle: true,
  format: 'iife',
  globalName: 'PhoneAuthApp',
  define: { 'process.env.NODE_ENV': '"production"' },
}).then(() => console.log('Build OK')).catch(e => { console.error(e); process.exit(1); });
