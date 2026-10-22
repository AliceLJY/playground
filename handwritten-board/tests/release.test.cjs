// Release-file checks for 手写板书: the published files (index.html, src/, vendor/) make no outside requests and carry nothing
// private, and every file the page loads is really there.  Run: node --test tests/*.test.cjs
// (HB_DIR=<folder> points the tests at another copy of the folder.)
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { parseWoff2, readNames } = require('./lib/woff2.cjs');
const ROOT = process.env.HB_DIR ? path.resolve(process.env.HB_DIR) : path.join(__dirname, '..');

const walk = (dir, base = '') => fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((e) => {
  const rel = path.join(base, e.name);
  if (e.name === '.DS_Store' || e.name === 'node_modules' || e.name === 'check-out') return [];
  return e.isDirectory() ? walk(dir, rel) : [rel];
});
const ALL = walk(ROOT);
const isBinary = (f) => /\.(woff2?|ttf|png|jpe?g|webp|gif|mp4)$/i.test(f);
const text = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// what gets published: the page, its source, its vendored libraries and fonts
const RELEASE = ALL.filter((f) => f === 'index.html' || f.startsWith('src' + path.sep) || f.startsWith('vendor' + path.sep));
// files a browser would execute or style with; the rest of vendor/ is licence text that is shipped but never loaded
const LOADABLE = RELEASE.filter((f) => /\.(html|js|css|svg|json)$/i.test(f));

// Strings built from pieces so this file does not trip its own scan.
const LOCAL = [['/Us' + 'ers/', 'a macOS home path'], ['/ho' + 'me/', 'a Linux home path'], ['file:' + '//', 'a file URL'], ['anxian' + 'jingya', 'the local account name'],
  ['sync-' + 'bridge', 'the local sync folder'], ['/Vol' + 'umes/', 'a mounted volume path'], ['story-video-' + 'fonts', 'the local font cache'], ['lijing' + 'ya', 'a personal address'],
  ['192.168' + '.', 'a LAN address'], ['.ts' + 'net.net', 'a private network name'], ['@gm' + 'ail', 'an e-mail address']];

test('no local path, file URL, account name or private-network address in any file of the folder (spec #1)', () => {
  const hits = [];
  for (const f of ALL.filter((f) => !isBinary(f))) {
    const t = text(f);
    for (const [needle, what] of LOCAL) if (t.includes(needle)) hits.push(`${f}: ${what}`);
    if (f !== path.join('vendor', 'gsap.min.js') && /\b[A-Za-z]:\\\w/.test(t)) hits.push(`${f}: a Windows path`);
  }
  assert.deepStrictEqual(hits, [], 'spec #1: the folder is published as is');
});

test('the font file carries no local path in its name records (spec #1)', () => {
  const names = readNames(parseWoff2(fs.readFileSync(path.join(ROOT, 'vendor', 'LongCang-Regular.subset.woff2'))));
  for (const [needle, what] of LOCAL.slice(0, 7)) for (const n of names) assert.ok(!n.text.includes(needle), `spec #1: font name record ${n.id} holds ${what}`);
});

// Every address that appears in a loadable release file must be listed here with its reason.
// XML namespace names are identifiers, not addresses the browser fetches; GSAP's licence header and one warning string name its home page.
const NAMESPACE = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xhtml'];
const ALLOWED_URLS = {
  'index.html': NAMESPACE,
  [path.join('src', 'board.js')]: NAMESPACE,
  [path.join('vendor', 'gsap.min.js')]: [...NAMESPACE, 'https://gsap.com', 'https://gsap.com/standard-license'],
};

test('every URL in the loadable release files is an XML namespace name or GSAP\'s licence text (spec #1)', () => {
  const found = [];
  for (const f of LOADABLE) {
    const urls = text(f).match(/(?:https?|wss?|ftp):\/\/[^\s"'`<>)\\]+|(?<![:\w/])\/\/[a-z0-9-]+\.[a-z0-9.-]+\/[^\s"'`<>)]*/gi) || [];
    for (const u of urls) if (!(ALLOWED_URLS[f] || []).includes(u.replace(/[.,;]+$/, ''))) found.push(`${f}: ${u}`);
  }
  assert.deepStrictEqual(found, [], 'spec #1: an address in a published file that would be (or looks like it could be) an outside request');
});

test('nothing in the page or its source can make a network request (spec #1)', () => {
  const own = LOADABLE.filter((f) => f !== path.join('vendor', 'gsap.min.js'));
  const calls = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|\bimport\s*\(|@import|serviceWorker|new\s+Image\b|<iframe|<img\b|<video|<audio|<embed|<object|srcset\s*=|<link\b[^>]*\brel\s*=\s*["']?(?:stylesheet|preload|prefetch|modulepreload|preconnect|dns-prefetch)/i;
  for (const f of own) assert.ok(!calls.test(text(f)), `spec #1: ${f} contains something that loads from the network`);
  // the vendored library too: the minified GSAP must not contain any of these, so upgrading it re-opens the question
  const lib = text(path.join('vendor', 'gsap.min.js'));
  for (const k of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'importScripts', 'import(']) assert.ok(!lib.includes(k), `spec #1: vendor/gsap.min.js contains ${k}`);
});

test('every src / href / url() in index.html is a relative path to a file that exists (spec #1)', () => {
  const html = text('index.html');
  const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)].map((m) => ({ ref: m[1], tag: html.slice(html.lastIndexOf('<', m.index), m.index).slice(1).split(/\s/)[0].toLowerCase() }))
    .concat([...html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => ({ ref: m[1], tag: 'css' })));
  assert.ok(refs.length >= 5, 'spec #1: expected the script, font and icon references, found ' + refs.length);
  for (const { ref, tag } of refs) {
    if (tag === 'a' && /^https?:\/\//.test(ref)) continue;                          // a plain hyperlink to another page is not a request
    if (tag === 'link' && ref === 'data:,') continue;                                // empty icon, stops the browser asking for /favicon.ico
    assert.ok(!/^([a-z][a-z0-9+.-]*:|\/)/i.test(ref), `spec #1: <${tag}> points at "${ref}", which is not a relative path`);
    assert.ok(fs.existsSync(path.join(ROOT, ref)), `spec #1: <${tag}> points at "${ref}", which does not exist`);
  }
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) assert.ok(RELEASE.includes(path.normalize(m[1])), `spec #1: script ${m[1]} is not under index.html / src / vendor`);
});

test('GSAP keeps its original copyright header and is the version the notices name (spec #3)', () => {
  const lib = text(path.join('vendor', 'gsap.min.js'));
  assert.ok(lib.startsWith('/*!\n * GSAP 3.13.0\n * https://gsap.com'), 'spec #3: the licence header at the top of vendor/gsap.min.js was changed or removed');
  assert.ok(/@license Copyright 2025, GreenSock\. All rights reserved\.\s*\n \* Subject to the terms at https:\/\/gsap\.com\/standard-license/.test(lib), 'spec #3: the @license lines of the header are gone');
  const notices = text('THIRD_PARTY_NOTICES.md');
  assert.ok(notices.includes('3.13.0'), 'spec #3: THIRD_PARTY_NOTICES.md should name the GSAP version it ships');
});

test('licence texts ship with the files they cover (spec #3)', () => {
  assert.ok(/SIL OPEN FONT LICENSE Version 1\.1/.test(text(path.join('vendor', 'OFL-LongCang.txt'))), 'spec #3: vendor/OFL-LongCang.txt is not the OFL 1.1 text');
  assert.ok(/Copyright 2018 The Long Cang Project Authors/.test(text(path.join('vendor', 'OFL-LongCang.txt'))), 'spec #3: the OFL file lost its copyright line');
  assert.ok(/Standard "No Charge" GSAP License/.test(text(path.join('vendor', 'GSAP-LICENSE.txt'))), 'spec #3: vendor/GSAP-LICENSE.txt is not the GSAP licence');
  const notices = text('THIRD_PARTY_NOTICES.md');
  for (const need of ['GSAP', 'Long Cang', 'SIL Open Font License', 'vendor/OFL-LongCang.txt', 'vendor/GSAP-LICENSE.txt']) assert.ok(notices.includes(need), `spec #3: THIRD_PARTY_NOTICES.md never mentions "${need}"`);
});

test('the published folder stays within the size budget (spec #3)', () => {
  const total = RELEASE.reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
  assert.ok(total <= 400 * 1024, `spec #3: published files (index.html, src/, vendor/) add up to ${total} bytes, budget is 409600`);
});

test('README.md is English only, README_CN.md is Chinese, and both end with the who-it\'s-for / AI-assets section (spec #3)', () => {
  const en = text('README.md'), cn = text('README_CN.md');
  const cjk = en.match(/[　-〿㐀-鿿＀-￯]/g) || [];
  assert.deepStrictEqual(cjk, [], 'spec #3: README.md must have no Chinese characters (README_CN.md is the Chinese one)');
  assert.ok((cn.match(/[一-鿿]/g) || []).length > 200, 'spec #3: README_CN.md should be Chinese');
  const lastHeading = (t) => [...t.matchAll(/^## (.+)$/gm)].pop()[1].trim();
  assert.strictEqual(lastHeading(en), "Who it's for, AI assets", 'spec #3: last section of README.md');
  assert.strictEqual(lastHeading(cn), '谁会点开、AI 素材', 'spec #3: last section of README_CN.md');
  for (const [name, t, who, ai] of [['README.md', en, '- Who it\'s for:', '- AI assets:'], ['README_CN.md', cn, '- 谁会点开：', '- AI 素材清单：']]) {
    const tail = t.slice(t.lastIndexOf('\n## '));
    assert.ok(tail.includes(who) && tail.includes(ai), `spec #3: ${name} last section needs the two bullets "${who}" and "${ai}"`);
  }
});
