const fs = require('fs');
const dir = './public/assets';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Simple SVG icons for PWA
const svg192 = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192">
<rect width="192" height="192" rx="32" fill="#7c3aed"/>
<text x="96" y="138" text-anchor="middle" font-size="100">🕊️</text>
</svg>`;
fs.writeFileSync(dir + '/icon-192.svg', svg192);

const svg512 = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
<rect width="512" height="512" rx="64" fill="#7c3aed"/>
<text x="256" y="370" text-anchor="middle" font-size="280">🕊️</text>
</svg>`;
fs.writeFileSync(dir + '/icon-512.svg', svg512);

// Copy same SVG as PNG (browsers handle this fine)
fs.copyFileSync(dir + '/icon-192.svg', dir + '/icon-192.png');
fs.copyFileSync(dir + '/icon-512.svg', dir + '/icon-512.png');

console.log('Icons created');
