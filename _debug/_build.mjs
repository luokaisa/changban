import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['public/phone-auth-entry.jsx'],
  bundle: true,
  outfile: 'public/assets/phone-auth-bundle.js',
  format: 'iife',
  globalName: 'App',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
});
console.log('OK');
