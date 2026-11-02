// Conservative lexer for the deliberately small hot-file JS subset. No packages / eval / parser dependency.
const fs = require('node:fs');
const path = require('node:path');
function check(source, name = '<source>') {
  const tokens = [], errors = []; let i = 0, line = 1;
  function error(message, at = line) { errors.push(`${name}:${at}: ${message}`); }
  while (i < source.length) {
    const c = source[i], d = source[i + 1];
    if (/\s/.test(c)) { if (c === '\n') line++; i++; continue; }
    if (c === '/' && d === '/') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < source.length && source.slice(i, i + 2) !== '*/') { if (source[i++] === '\n') line++; } i += 2; continue; }
    if (c === '"' || c === "'") { const start = line; i++; while (i < source.length && source[i] !== c) { if (source[i] === '\\') i++; if (source[i++] === '\n') line++; } i++; tokens.push({ v: 'STRING', line: start }); continue; }
    if (c === '`') { error('template literals are outside the hot subset'); i++; continue; }
    const word = source.slice(i).match(/^(?:[A-Za-z_$][\w$]*|\d+(?:\.\d+)?)/);
    const v = word ? word[0] : source.slice(i, i + 2) === '=>' ? '=>' : c;
    tokens.push({ v, line }); i += v.length;
  }
  let depth = 0;
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j], p = tokens[j - 1]?.v, n = tokens[j + 1]?.v;
    if (t.v === 'new' || t.v === '=>') error('allocation / closure forbidden: ' + t.v, t.line);
    if (t.v === 'function' && (depth !== 0 || !/^[A-Za-z_$]/.test(n || '') || j > 0 && p !== ';' && p !== '}')) error('only named top-level function declarations allowed', t.line);
    if (t.v === '{') {
      if (![')', 'else', 'try', 'finally', 'do'].includes(p)) error('object literal / unsupported block', t.line);
      depth++;
    }
    if (t.v === '}') depth--;
    if (t.v === '[' && !(p && (/^[A-Za-z_$][\w$]*$/.test(p) && !['return', 'yield', 'case', 'throw', 'void', 'delete', 'typeof', 'await', 'else', 'in', 'of'].includes(p) || [']', ')'].includes(p)))) error('array literal forbidden', t.line);
    if (['map', 'filter', 'slice', 'concat', 'flat', 'flatMap', 'bind', 'from', 'of', 'split', 'match'].includes(t.v) && p === '.') error('allocating helper forbidden: ' + t.v, t.line);
    if ((t.v === 'random' && p === '.' && tokens[j - 2]?.v === 'Math') || (t.v === 'Date') || t.v === 'eval') error('nondeterministic / dynamic code forbidden', t.line);
    if (['Object', 'Array', 'Function', 'Promise', 'RegExp', 'Map', 'Set'].includes(t.v) || /^(?:Float|Uint|Int)\d+(?:Clamped)?Array$/.test(t.v)) error('allocation API forbidden: ' + t.v, t.line);
  }
  return errors;
}
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.hot.js') ? [path.join(dir, e.name)] : []); }
if (require.main === module) {
  const paths = process.argv.slice(2); if (!paths.length) paths.push(...files(path.join(__dirname, '../src')));
  const errors = paths.flatMap(p => check(fs.readFileSync(p, 'utf8'), p));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; } else console.log(`hot lint: ${paths.length} file(s), no forbidden constructs`);
}
module.exports = { check, files };
