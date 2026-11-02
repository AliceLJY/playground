const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { check, files } = require('../tools/lint-hot.cjs');
const C = require('../src/core.js'), P = require('../src/pilot.js'), QR = require('../src/qr.js');
const root = path.join(__dirname, '..');

test('A2: hot lint rejects calibrated violations before accepting production code', () => {
  const bad = [
    'function bad(s) { const p = new Float64Array(3); }',
    'function bad(s) { const p = new\nMap(); }',
    'const bad = () => 1;', 'const bad = function named() {};',
    'function bad(s) { function nested() { return s; } }',
    'function bad(s) { const x = { a: 1 }; }', 'function bad(s) { return {}; }',
    'function bad(s) { const a = []; }', 'function bad(s) { return [1, 2]; }',
    'function bad(s) { void []; }', 'function bad(s) { const a = Array(3); }',
    'function bad(s) { return s.items.map(f); }', 'function bad(s) { return Math.random(); }',
    'function bad(s) { return Date.now(); }'
  ];
  for (const source of bad) assert.ok(check(source).length > 0, 'known violation slipped through: ' + source);
  assert.equal(check("'use strict'; function good(s) { if (s.x) { s.a[0] += 1; } else { s.x = 2; } return s.a[s.x]; }").length, 0);
  for (const file of files(path.join(root, 'src'))) assert.deepEqual(check(fs.readFileSync(file, 'utf8'), file), []);
});

test('A2: every production JS file parses, simulation hot lint CLI passes', () => {
  for (const file of fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js'))) {
    const r = spawnSync(process.execPath, ['--check', path.join(root, 'src', file)], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
  }
  const r = spawnSync(process.execPath, [path.join(root, 'tools/lint-hot.cjs')], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
});

test('A3: exact static publish set is at most 150 KiB gzip, with no external assets', t => {
  const paths = ['index.html', ...fs.readdirSync(path.join(root, 'src')).map(f => 'src/' + f)];
  const bytes = paths.reduce((n, p) => n + zlib.gzipSync(fs.readFileSync(path.join(root, p))).length, 0);
  assert.ok(bytes <= 150 * 1024, `publish files separately gzipped: ${bytes} bytes exceeds 153600`);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/);
  assert.doesNotMatch(paths.filter(p => p.startsWith('src/')).map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n'), /\bfetch\s*\(|new\s+(?:Image|Audio)\s*\(|@font-face/);
  t.diagnostic(`gzip publish total: ${bytes} bytes / 153600`);
});

test('A9: QR matrix matches an independent Nayuki known vector, every module including ECC and format', () => {
  const fixture = require('./fixtures/qr-v4-l-mask0.json');
  assert.equal(fixture.text, C.data.url);
  assert.deepEqual(QR.encode(C.data.url).map(row => row.join('')), fixture.rows);
  assert.equal(QR.encode('a'.repeat(78)).length, 33);
  assert.throws(() => QR.encode('a'.repeat(79)), RangeError);
  assert.throws(() => QR.encode('煤'.repeat(27)), RangeError);
  // Calibration: a corrupt module is not accepted as the reference code.
  const broken = QR.encode(C.data.url); broken[10][10] ^= 1;
  assert.notDeepEqual(broken.map(row => row.join('')), fixture.rows);
});

function hash(s) {
  const h = crypto.createHash('sha256');
  for (const key of Object.keys(s)) {
    const value = s[key];
    if (ArrayBuffer.isView(value)) h.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    else if (typeof value !== 'object') h.update(key + ':' + value + ';');
  }
  return h.digest('hex');
}
test('A1: record a complete round including choices; replay all pool/scalar bytes identically on every frame', t => {
  // Random steering is intentionally allowed to die before the boss; precise guarantees a full recording.
  const original = C.create(5), pilot = P.create('precise', 5), tape = [], digests = [];
  while (original.phase < 2 && tape.length < 16000) {
    const input = Array.from(pilot(original)); tape.push(input); C.step(original, ...input); digests.push(hash(original));
  }
  assert.ok(original.phase >= 2 && original.tick > original.stage.duration, 'record a real whole round through the boss');
  assert.ok(tape.some(a => a[2] >= 0), 'choices must be present in recording');
  const replay = C.create(5);
  tape.forEach((input, frame) => { C.step(replay, ...input); assert.equal(hash(replay), digests[frame], `diverged at frame ${frame}`); });
  assert.equal(hash(replay), hash(original));
  const different = C.create(6); for (const a of tape) C.step(different, ...a);
  assert.notEqual(hash(different), hash(original));
  t.diagnostic(`replayed ${tape.length} frames; terminal SHA-256 ${hash(replay)}`);
});

test('A10: malformed persistent progress is bounded and does not unlock levels', () => {
  for (const v of [null, undefined, '', 'no', '{}', '999', '-1', '1.9']) assert.equal(C.unlocked(v), 1);
  assert.equal(C.unlocked('2'), 2); assert.equal(C.unlocked('3'), 3);
});
