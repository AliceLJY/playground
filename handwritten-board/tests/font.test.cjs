// Font checks for 手写板书 (SPEC §8 items 2 and 3).  The page draws its words in a bundled Long Cang subset; if a character is
// missing from the subset the browser quietly draws it in some other font, so the check reads the font file itself.
// Run: node --test tests/*.test.cjs        (HB_DIR=<folder> points the tests at another copy of the folder)
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { parseWoff2, readCmap, readNames } = require('./lib/woff2.cjs');
const ROOT = process.env.HB_DIR ? path.resolve(process.env.HB_DIR) : path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f));
const PAGES = require(path.join(ROOT, 'src', 'pages.js')), C = require(path.join(ROOT, 'src', 'core.js'));
const FONT_FILE = 'vendor/LongCang-Regular.subset.woff2';
const tables = parseWoff2(read(FONT_FILE)), cmap = readCmap(tables), names = readNames(tables);

// every character the page puts on the board, as the page really draws it (spaces become no-break spaces)
const boardChars = [...new Set(Array.from(C.displayText(PAGES.flatMap((p) => [p.title, ...p.lines.map((l) => l.text)]).join(''))))];

test('every character on the board is in the bundled font subset (spec #2)', () => {
  assert.ok(boardChars.length > 50, 'the board should have well over 50 distinct characters, got ' + boardChars.length);
  const missing = boardChars.filter((ch) => !(cmap.get(ch.codePointAt(0)) > 0));
  assert.deepStrictEqual(missing.map((ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ' ' + JSON.stringify(ch)), [],
    `spec #2: ${missing.length} character(s) the board draws are not in ${FONT_FILE}, so the browser would fall back to another font for them`);
});

test('the subset carries ASCII letters, digits and common Chinese punctuation too (spec #2)', () => {
  const want = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~', ...'、。，；：？！…—「」『』（）《》“”‘’', ' '];
  const missing = want.filter((ch) => !(cmap.get(ch.codePointAt(0)) > 0));
  assert.deepStrictEqual(missing, [], 'spec #2: these were asked for but are not in the subset');
});

test('the subset stays small: font file and glyph count within budget (spec #3)', () => {
  const size = fs.statSync(path.join(ROOT, FONT_FILE)).size;
  assert.ok(size <= 150 * 1024, `spec #3: font file is ${size} bytes, budget is 153600`);
  assert.ok(cmap.size <= 400, `spec #3: subset carries ${cmap.size} code points, budget is 400 (a full-font copy would be about 7000)`);
});

test('@font-face points at the bundled file, with no local() source that could hide a broken bundle (spec #2)', () => {
  const html = read('index.html').toString('utf8');
  const rules = html.match(/@font-face\s*\{[^}]*\}/g) || [];
  assert.strictEqual(rules.length, 1, 'spec #2: expected exactly one @font-face rule, found ' + rules.length);
  assert.ok(!/local\s*\(/.test(rules[0]), 'spec #2: @font-face must not use local(); an installed copy would mask a broken bundle');
  const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(rules[0]);
  assert.ok(url, 'spec #2: @font-face has no url()');
  assert.strictEqual(url[1], FONT_FILE, 'spec #2: @font-face url is ' + url[1]);
  assert.ok(fs.existsSync(path.join(ROOT, url[1])), 'spec #2: the font file the CSS names does not exist');
  const family = /font-family:\s*["']([^"']+)["']/.exec(rules[0])[1];
  const own = names.find((n) => n.id === 1 && n.platform === 3).text;
  assert.strictEqual(family, own, `spec #2: CSS family "${family}" differs from the font's own family name "${own}"`);
});

test('the font keeps its licence notice and nothing private (spec #3)', () => {
  const byId = (id) => names.filter((n) => n.id === id).map((n) => n.text);
  assert.ok(byId(0).some((t) => /Project Authors/.test(t)), 'spec #3: copyright record (name 0) was stripped from the subset');
  assert.ok(byId(13).some((t) => /SIL Open Font License/.test(t)), 'spec #3: licence record (name 13) was stripped from the subset');
  for (const n of names) assert.ok(!/\/Us\w+rs\/|\/home\/|[A-Za-z]:\\/.test(n.text), `spec #3: name record ${n.id} holds a local path: ${n.text}`);
});
