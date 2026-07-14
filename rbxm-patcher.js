// Minimal Roblox binary model (.rbxm) reader/writer — browser-safe (Uint8Array/DataView only).
// Ground truth: rojo-rbx/rbx-dom `rbx_binary` crate (core.rs, chunk.rs, deserializer/state.rs).
// Only supports what this app needs: reading INST (class+name index) and patching String-type
// PROP chunks (Name, Source, SoundId) in place. No instance add/remove — the shipped template
// ships pre-allocated Sound "slots" per show so this is never required.
(function(global){
'use strict';

const MAGIC = new Uint8Array([0x3c,0x72,0x6f,0x62,0x6c,0x6f,0x78,0x21,0x89,0xff,0x0d,0x0a,0x1a,0x0a]); // "<roblox!" + sig

// ---------- minimal raw-block LZ4 (ported from lz4js, MIT) ----------
const minMatch = 4;
function lz4DecompressBlock(src, dst, sIndex, sLength, dIndex){
  const sEnd = sIndex + sLength;
  while(sIndex < sEnd){
    const token = src[sIndex++];
    let literalCount = token >> 4;
    if(literalCount > 0){
      if(literalCount === 0xf){
        while(true){ literalCount += src[sIndex]; if(src[sIndex++] !== 0xff) break; }
      }
      for(let n = sIndex + literalCount; sIndex < n;) dst[dIndex++] = src[sIndex++];
    }
    if(sIndex >= sEnd) break;
    let mLength = token & 0xf;
    let mOffset = src[sIndex++] | (src[sIndex++] << 8);
    if(mLength === 0xf){
      while(true){ mLength += src[sIndex]; if(src[sIndex++] !== 0xff) break; }
    }
    mLength += minMatch;
    for(let i = dIndex - mOffset, n = i + mLength; i < n;) dst[dIndex++] = dst[i++] | 0;
  }
  return dIndex;
}
function makeHashTable(){ return new Uint32Array(1 << 16); }
function lz4CompressBlock(src, dst, sIndex, sLength, hashTable){
  // Straight port of lz4js's compressBlock.
  const searchMatchCount = (1 << 6) * (1 << 6);
  let mAnchor = sIndex, mIndex = 0, mLength = 0, mOffset = 0;
  let dIndex = 0;
  const sEnd = sIndex + sLength;
  const mLimit = sEnd - 5; // matches lz4js searchLimit-ish tail guard
  function writeVarLength(len, dIndex_){
    while(len >= 0xff){ dst[dIndex_++] = 0xff; len -= 0xff; }
    dst[dIndex_++] = len;
    return dIndex_;
  }
  function hashU32(a){
    a = a | 0;
    a = a + 2127912214 + (a << 12) | 0;
    a = a ^ -949894596 ^ a >>> 19;
    a = a + 374761393 + (a << 5) | 0;
    a = a + -744332180 ^ a << 9;
    a = a + -42973499 + (a << 3) | 0;
    return a ^ -1252372727 ^ a >>> 16 | 0;
  }
  if(sLength < 13){
    // Too short to usefully compress; signal "store raw" to caller via 0-length output.
    return 0;
  }
  let sIndex2 = sIndex;
  while(sIndex2 < mLimit){
    const seq = (src[sIndex2]) | (src[sIndex2+1] << 8) | (src[sIndex2+2] << 16) | (src[sIndex2+3] << 24);
    const hash = hashU32(seq) >>> 16;
    const candidate = hashTable[hash];
    hashTable[hash] = sIndex2;
    if(candidate !== 0 &&
       sIndex2 - candidate <= 0xffff &&
       src[candidate] === src[sIndex2] && src[candidate+1] === src[sIndex2+1] &&
       src[candidate+2] === src[sIndex2+2] && src[candidate+3] === src[sIndex2+3]){
      mIndex = candidate; mOffset = sIndex2 - candidate;
      let mLen = 4;
      while(sIndex2 + mLen < sEnd && src[mIndex + mLen] === src[sIndex2 + mLen]) mLen++;
      mLength = mLen;

      const literalCount = sIndex2 - mAnchor;
      const token = (Math.min(literalCount,0xf) << 4) | Math.min(mLength - minMatch, 0xf);
      dst[dIndex++] = token;
      if(literalCount >= 0xf) dIndex = writeVarLength(literalCount - 0xf, dIndex);
      for(let n = mAnchor + literalCount; mAnchor < n;) dst[dIndex++] = src[mAnchor++];
      dst[dIndex++] = mOffset & 0xff; dst[dIndex++] = (mOffset >> 8) & 0xff;
      if(mLength - minMatch >= 0xf) dIndex = writeVarLength(mLength - minMatch - 0xf, dIndex);
      sIndex2 += mLength; mAnchor = sIndex2;
      continue;
    }
    sIndex2++;
  }
  // Final literal run
  const literalCount = sEnd - mAnchor;
  const token = Math.min(literalCount, 0xf) << 4;
  dst[dIndex++] = token;
  if(literalCount >= 0xf) dIndex = writeVarLength(literalCount - 0xf, dIndex);
  for(let n = mAnchor + literalCount; mAnchor < n;) dst[dIndex++] = src[mAnchor++];
  return dIndex;
}

function zigzagEncode32(v){ return ((v << 1) ^ (v >> 31)) | 0; }
function zigzagDecode32(v){ return ((v >>> 1) ^ -(v & 1)) | 0; }

function decompressBlock(bytes, compLen, uncompLen){
  if(compLen === 0) return bytes.subarray(0, uncompLen);
  const dst = new Uint8Array(uncompLen);
  const n = lz4DecompressBlock(bytes, dst, 0, compLen, 0);
  if(n !== uncompLen) throw new Error(`LZ4 decompress size mismatch: got ${n}, expected ${uncompLen}`);
  return dst;
}
function compressBlock(bytes){
  const dst = new Uint8Array(Math.max(bytes.length * 2 + 32, 64));
  const n = lz4CompressBlock(bytes, dst, 0, bytes.length, makeHashTable());
  return n > 0 ? dst.subarray(0, n) : new Uint8Array(0);
}

class Reader{
  constructor(buf){ this.buf = buf; this.pos = 0; this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
  u8(){ return this.buf[this.pos++]; }
  u16(){ const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
  u32(){ const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  bytes(n){ const v = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return v; }
  string(){ const len = this.u32(); const v = new TextDecoder('utf-8').decode(this.bytes(len)); return v; }
  binBytes(){ const len = this.u32(); return this.bytes(len); }
  atEnd(){ return this.pos >= this.buf.length; }
  interleavedRaw(len){
    const bytes = this.bytes(len * 4);
    const out = new Array(len);
    for(let i = 0; i < len; i++){
      out[i] = ((bytes[i] << 24) | (bytes[len+i] << 16) | (bytes[2*len+i] << 8) | bytes[3*len+i]) | 0;
    }
    return out;
  }
  interleavedI32(len){ return this.interleavedRaw(len).map(zigzagDecode32); }
  referentArray(len){
    const raw = this.interleavedI32(len);
    let last = 0;
    return raw.map(v => { last += v; return last; });
  }
}

class Writer{
  constructor(){ this.chunks = []; this.len = 0; }
  push(u8){ this.chunks.push(u8); this.len += u8.length; }
  u32(v){ const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this.push(b); }
  string(s){ const b = new TextEncoder().encode(s); this.u32(b.length); this.push(b); }
  binBytes(b){ this.u32(b.length); this.push(b); }
  u8(v){ this.push(new Uint8Array([v & 0xff])); }
  toBytes(){
    const out = new Uint8Array(this.len);
    let o = 0;
    for(const c of this.chunks){ out.set(c, o); o += c.length; }
    return out;
  }
}

function readChunkHeader(r){
  const name = new TextDecoder('latin1').decode(r.bytes(4));
  const compressedLen = r.u32();
  const uncompressedLen = r.u32();
  r.u32(); // reserved
  return { name, compressedLen, uncompressedLen };
}

function bytesEqual(a, b){
  if(a.length !== b.length) return false;
  for(let i=0;i<a.length;i++) if(a[i] !== b[i]) return false;
  return true;
}

function parseFile(buf){
  if(!bytesEqual(buf.subarray(0,14), MAGIC)) throw new Error('Not a valid .rbxm/.rbxl binary file (magic mismatch)');
  const r = new Reader(buf);
  r.pos = 14;
  const version = r.u16();
  const numClasses = r.u32();
  const numInstances = r.u32();
  r.bytes(8);

  const chunks = [];
  while(true){
    const chunkStart = r.pos;
    const hdr = readChunkHeader(r);
    const body = r.bytes(hdr.compressedLen === 0 ? hdr.uncompressedLen : hdr.compressedLen);
    const data = decompressBlock(body, hdr.compressedLen, hdr.uncompressedLen);
    // Keep the exact original bytes (header+body) so unmodified chunks can be
    // copied verbatim on rebuild instead of being re-encoded through our own
    // (much less battle-tested) LZ4 implementation.
    const originalBytes = buf.subarray(chunkStart, r.pos);
    chunks.push({ name: hdr.name, data, originalBytes });
    if(hdr.name === 'END\0') break;
    if(r.atEnd()) break;
  }

  const classes = new Map();
  for(const chunk of chunks){
    if(chunk.name !== 'INST') continue;
    const cr = new Reader(chunk.data);
    const typeId = cr.u32();
    const className = cr.string();
    cr.u8();
    const count = cr.u32();
    const referents = cr.referentArray(count);
    classes.set(typeId, { className, referents, names: new Array(count).fill(null) });
  }
  for(const chunk of chunks){
    if(chunk.name !== 'PROP') continue;
    const cr = new Reader(chunk.data);
    const typeId = cr.u32();
    const propName = cr.string();
    if(propName !== 'Name') continue;
    const cls = classes.get(typeId);
    if(!cls) continue;
    if(cr.atEnd()) continue;
    const typeByte = cr.u8();
    if(typeByte !== 0x01) continue;
    for(let i = 0; i < cls.referents.length; i++){
      cls.names[i] = new TextDecoder('utf-8').decode(cr.binBytes());
    }
  }
  return { version, numClasses, numInstances, chunks, classes };
}

function findAllInstances(parsed, className){
  const out = [];
  for(const [typeId, cls] of parsed.classes){
    if(cls.className !== className) continue;
    for(let i = 0; i < cls.referents.length; i++){
      out.push({ typeId, index: i, name: cls.names[i] });
    }
  }
  return out;
}

// Rewrite a String-type (0x01) PROP chunk with one entry replaced.
function patchStringProp(chunk, index, newValue){
  const cr = new Reader(chunk.data);
  const typeId = cr.u32();
  const propName = cr.string();
  const typeByte = cr.u8();
  if(typeByte !== 0x01) throw new Error(`patchStringProp: ${propName} is not String-type (byte=${typeByte})`);
  const values = [];
  while(!cr.atEnd()) values.push(cr.binBytes());
  values[index] = new TextEncoder().encode(newValue);
  const w = new Writer();
  w.u32(typeId); w.string(propName); w.u8(0x01);
  for(const v of values) w.binBytes(v);
  return w.toBytes();
}

// Always store as uncompressed (compressedLen=0). This is a completely valid,
// explicitly-supported form in Roblox's own format (plenty of chunks in any
// real file already use it) — and it means we never depend on our own LZ4
// encoder being bit-perfect, which is the thing worth *not* gambling on here.
function serializeChunkRaw(name, data){
  const header = new Uint8Array(16);
  header.set(new TextEncoder().encode(name), 0);
  const dv = new DataView(header.buffer);
  dv.setUint32(4, 0, true);
  dv.setUint32(8, data.length, true);
  dv.setUint32(12, 0, true);
  const out = new Uint8Array(16 + data.length);
  out.set(header, 0); out.set(data, 16);
  return out;
}

function rebuildFile(parsed, chunkOverrides){
  const head = new Uint8Array(32);
  head.set(MAGIC, 0);
  const dv = new DataView(head.buffer);
  dv.setUint16(14, parsed.version, true);
  dv.setUint32(16, parsed.numClasses, true);
  dv.setUint32(20, parsed.numInstances, true);
  const parts = [head];
  parsed.chunks.forEach((chunk, i) => {
    if(chunkOverrides.has(i)){
      parts.push(serializeChunkRaw(chunk.name, chunkOverrides.get(i)));
    } else {
      // Untouched chunk: copy the exact original bytes, no re-encoding at all.
      parts.push(chunk.originalBytes);
    }
  });
  let total = 0; for(const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0; for(const p of parts){ out.set(p, o); o += p.length; }
  return out;
}

function findPropChunkIndex(parsed, className, propName){
  let typeId = null;
  for(const [tid, cls] of parsed.classes) if(cls.className === className) typeId = tid;
  if(typeId === null) return null;
  for(let i = 0; i < parsed.chunks.length; i++){
    const c = parsed.chunks[i];
    if(c.name !== 'PROP') continue;
    const cr = new Reader(c.data);
    const tid2 = cr.u32();
    const pn = cr.string();
    if(tid2 === typeId && pn === propName) return i;
  }
  return null;
}

function readStringPropValues(chunk){
  const cr = new Reader(chunk.data);
  cr.u32(); cr.string(); cr.u8();
  const values = [];
  while(!cr.atEnd()) values.push(new TextDecoder('utf-8').decode(cr.binBytes()));
  return values;
}

function writeStringPropAll(chunk, values){
  const cr = new Reader(chunk.data);
  const typeId = cr.u32();
  const propName = cr.string();
  cr.u8();
  const w = new Writer();
  w.u32(typeId); w.string(propName); w.u8(0x01);
  for(const v of values) w.binBytes(new TextEncoder().encode(v));
  return w.toBytes();
}

global.RbxmPatcher = { parseFile, findAllInstances, patchStringProp, rebuildFile, findPropChunkIndex, readStringPropValues, writeStringPropAll };
// served as a static asset, loaded via <script src="/rbxm-patcher.js"></script>
})(typeof window !== 'undefined' ? window : globalThis);
