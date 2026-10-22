// Cuts the Long Cang font down to the characters the board actually writes, plus ASCII and common
// Chinese punctuation, and writes it as WOFF2 into vendor/.  Run by hand when the board's words change;
// it is not part of publishing.
//   node tools/subset-font.cjs <path to LongCang-Regular.ttf>
// The full font (SIL OFL 1.1) comes from https://github.com/google/fonts/tree/main/ofl/longcang and is not
// kept in this repository.  Needs uv (https://docs.astral.sh/uv/); fonttools and brotli are fetched on demand.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('usage: node tools/subset-font.cjs <LongCang-Regular.ttf>'); process.exit(2); }
const root = path.join(__dirname, '..');
const PAGES = require(path.join(root, 'src', 'pages.js')), { displayText } = require(path.join(root, 'src', 'core.js'));

// what the page really draws: spaces go in as no-break spaces (core.js displayChar)
const boardText = displayText(PAGES.flatMap((p) => [p.title, ...p.lines.map((l) => l.text)]).join(''));
const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');   // U+0020..U+007E: letters, digits, punctuation
const cjkPunct = '、。，．；：？！…—「」『』（）《》〈〉“”‘’～';
const chars = [...new Set([...boardText, ...ascii, ...cjkPunct])].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');

const listFile = path.join(root, 'vendor', 'LongCang-subset-chars.txt');
const outFile = path.join(root, 'vendor', 'LongCang-Regular.subset.woff2');
fs.writeFileSync(listFile, chars + '\n');
const r = spawnSync('uvx', ['--from', 'fonttools', '--with', 'brotli', 'pyftsubset', src,
  '--text-file=' + listFile, '--flavor=woff2', '--output-file=' + outFile,
  '--name-IDs=*', '--name-languages=*', '--notdef-outline', '--no-hinting'], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`${[...chars].length} characters requested (${[...new Set(boardText)].length} distinct on the board), ${fs.statSync(outFile).size} bytes -> ${path.relative(root, outFile)}`);
