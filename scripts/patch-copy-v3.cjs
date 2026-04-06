const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, '..', 'src', 'app', 'calendar', 'page.tsx');
const copyPath = path.join(__dirname, 'calendar-copy-v3.txt');

const page = fs.readFileSync(pagePath, 'utf8');
const newCopy = fs.readFileSync(copyPath, 'utf8');

const START = 'const CAT_COPY: Record<Category, CopyVariants> = {';
const END = '// ── Aspect context classifier';

const si = page.indexOf(START);
const ei = page.indexOf(END);

if (si === -1) { console.error('START marker not found'); process.exit(1); }
if (ei === -1) { console.error('END marker not found'); process.exit(1); }

const before = page.slice(0, si);
const after = page.slice(ei);

const result = before + newCopy.trimEnd() + '\n\n' + after;
fs.writeFileSync(pagePath, result, 'utf8');
console.log('✅ CAT_COPY patched (v3)');
