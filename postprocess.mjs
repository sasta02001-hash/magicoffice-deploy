import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('dist/index.html');
let html = fs.readFileSync(file, 'utf8');

html = html.replace(/<style\s+id=["']magicoffice-home-petal-scale-fix-v1["']>[\s\S]*?<\/style>/gi, '');

const style = `<style id="magicoffice-home-petal-scale-fix-v1">.mo-home-petal{display:block!important;width:18px!important;height:10px!important}@keyframes mo-home-petal-fall{0%{transform:translate3d(0,-90px,0) rotate(0deg) scale(var(--scale,1))}100%{transform:translate3d(var(--drift,55px),var(--fall,900px),0) rotate(var(--spin,560deg)) scale(var(--scale,1))}}@media(max-width:960px){.mo-home-petal{width:14px!important;height:8px!important}}</style>`;

if (!html.includes('</head>')) throw new Error('Missing </head> during petal CSS postprocess');
html = html.replace('</head>', `${style}</head>`);

if (!html.includes('magicoffice-home-petal-scale-fix-v1')) throw new Error('Petal scale fix was not inserted');
if ((html.match(/class="mo-home-petal"/g) || []).length !== 6) throw new Error('Petal count changed during postprocess');

fs.writeFileSync(file, html);
console.log('MAGICOFFICE_PETAL_SCALE_FIX_OK');
