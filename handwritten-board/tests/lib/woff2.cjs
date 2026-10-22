// A small WOFF2 reader, just enough to answer "which code points does this font carry" and "what do its name records say".
// WOFF2 keeps cmap and name untransformed, so it is enough to un-Brotli the table stream (zlib has Brotli built in) and walk the
// table directory by hand.  No dependencies.  Spec: https://www.w3.org/TR/WOFF2/
const zlib = require('zlib');

const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG',
  'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar',
  'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function parseWoff2(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file (signature ' + JSON.stringify(buf.toString('latin1', 0, 4)) + ')');
  const numTables = buf.readUInt16BE(12), compressedSize = buf.readUInt32BE(20);
  let p = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const b = buf[p++]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return v; } throw new Error('bad UIntBase128'); };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++], idx = flags & 0x3f, version = flags >> 6;
    let tag; if (idx === 63) { tag = buf.toString('latin1', p, p + 4); p += 4; } else tag = KNOWN_TAGS[idx];
    const origLength = base128();
    // glyf/loca are transformed with version 0 (3 = not transformed); every other table is transformed with a non-zero version
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    const length = transformed ? base128() : origLength;
    dir.push({ tag, transformed, origLength, length });
  }
  const stream = zlib.brotliDecompressSync(buf.subarray(p, p + compressedSize));
  let off = 0; const tables = {};
  for (const t of dir) { tables[t.tag] = { ...t, data: stream.subarray(off, off + t.length) }; off += t.length; }
  return tables;
}

// Map of code point -> glyph id from the best Unicode cmap subtable (format 12 if present, else format 4).
function readCmap(tables) {
  if (!tables.cmap) throw new Error('font has no cmap table');
  if (tables.cmap.transformed) throw new Error('cmap should not be transformed');
  const d = tables.cmap.data, n = d.readUInt16BE(2), subs = [];
  for (let i = 0; i < n; i++) {
    const platform = d.readUInt16BE(4 + i * 8), encoding = d.readUInt16BE(6 + i * 8), offset = d.readUInt32BE(8 + i * 8);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (unicode) subs.push({ offset, format: d.readUInt16BE(offset) });
  }
  const sub = subs.find((s) => s.format === 12) || subs.find((s) => s.format === 4);
  if (!sub) throw new Error('no Unicode cmap subtable of format 4 or 12');
  const map = new Map(), o = sub.offset;
  if (sub.format === 12) {
    const groups = d.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const s = d.readUInt32BE(o + 16 + g * 12), e = d.readUInt32BE(o + 20 + g * 12), gid = d.readUInt32BE(o + 24 + g * 12);
      for (let c = s; c <= e; c++) map.set(c, gid + (c - s));
    }
  } else {
    const segX2 = d.readUInt16BE(o + 6), seg = segX2 / 2;
    const endAt = o + 14, startAt = endAt + segX2 + 2, deltaAt = startAt + segX2, rangeAt = deltaAt + segX2;
    for (let s = 0; s < seg; s++) {
      const end = d.readUInt16BE(endAt + s * 2), start = d.readUInt16BE(startAt + s * 2), delta = d.readInt16BE(deltaAt + s * 2), ro = d.readUInt16BE(rangeAt + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid;
        if (ro === 0) gid = (c + delta) & 0xffff;
        else { const at = rangeAt + s * 2 + ro + (c - start) * 2; gid = d.readUInt16BE(at); if (gid) gid = (gid + delta) & 0xffff; }
        map.set(c, gid);
      }
    }
  }
  return map;
}

// name records as { id, platform, text }
function readNames(tables) {
  const d = tables.name.data, count = d.readUInt16BE(2), strings = d.readUInt16BE(4), out = [];
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12, platform = d.readUInt16BE(r), id = d.readUInt16BE(r + 6), len = d.readUInt16BE(r + 8), off = d.readUInt16BE(r + 10);
    const raw = d.subarray(strings + off, strings + off + len);
    let text;
    if (platform === 3 || platform === 0) { const sw = Buffer.from(raw); sw.swap16(); text = sw.toString('utf16le'); } else text = raw.toString('latin1');
    out.push({ id, platform, text });
  }
  return out;
}

module.exports = { parseWoff2, readCmap, readNames };
