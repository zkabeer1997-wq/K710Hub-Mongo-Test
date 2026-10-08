// Byte-level sanity check of an uploaded screenshot BEFORE decoding.
// Pure ES module: no fs, no node: imports, no DOM. Works in Node, browsers and workers.

/** Hard upload limit. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/**
 * Width every screenshot is resized to before reading.
 * PROVISIONAL placeholder: tune on real fixtures once they exist.
 */
export const STANDARD_WIDTH = 1080;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function u32(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function ascii(b, o, n) {
  let s = '';
  for (let i = 0; i < n; i += 1) s += String.fromCharCode(b[o + i]);
  return s;
}

function startsWith(b, sig) {
  if (b.length < sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) if (b[i] !== sig[i]) return false;
  return true;
}

function detectFormat(b) {
  if (startsWith(b, PNG_SIG)) return 'png';
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) return 'heic';
  }
  return 'unknown';
}

function checkPng(b, reasons) {
  let pos = 8;
  let sawIend = false;
  while (pos + 12 <= b.length) {
    const len = u32(b, pos);
    const type = ascii(b, pos + 4, 4);
    const next = pos + 12 + len;
    if (next > b.length) {
      reasons.push('The PNG file is cut off in the middle of a data block.');
      return false;
    }
    pos = next;
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
  }
  if (!sawIend) {
    reasons.push('The PNG file has no end marker (IEND): the upload was probably cut short.');
    return false;
  }
  if (pos !== b.length) {
    reasons.push('The PNG file has extra bytes after its end marker.');
    return false;
  }
  return true;
}

function checkJpeg(b, reasons, flags) {
  let end = b.length;
  while (end > 2 && b[end - 1] === 0) end -= 1; // tolerate zero padding
  if (!(b[end - 2] === 0xff && b[end - 1] === 0xd9)) {
    reasons.push('The JPEG file has no end marker (EOI): the upload was probably cut short.');
    return false;
  }
  // Walk marker segments up to the scan start to spot progressive encodings.
  let pos = 2;
  while (pos + 4 <= b.length) {
    if (b[pos] !== 0xff) break;
    const marker = b[pos + 1];
    if (marker === 0xff) { pos += 1; continue; }
    if (marker === 0xc2 || marker === 0xc6 || marker === 0xca || marker === 0xce) flags.progressive = true;
    if (marker === 0xda) break; // start of scan
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { pos += 2; continue; }
    pos += 2 + ((b[pos + 2] << 8) | b[pos + 3]);
  }
  return true;
}

function checkWebp(b, reasons) {
  const size = (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) >>> 0;
  if (size + 8 === b.length || size + 9 === b.length) return true; // odd sizes may carry 1 pad byte
  reasons.push(size + 8 > b.length
    ? 'The WebP file is shorter than its header says: the upload was probably cut short.'
    : 'The WebP file has extra bytes after its declared size.');
  return false;
}

/**
 * @param {Uint8Array} bytes
 * @param {{ maxBytes?: number }} [options]
 * @returns {{ ok: boolean, format: 'png'|'jpeg'|'webp'|'heic'|'unknown', complete: boolean, reasons: string[], action: 'accept'|'redraw'|'reject' }}
 */
export function checkImageBytes(bytes, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  const reasons = [];
  if (!bytes || typeof bytes.length !== 'number' || bytes.length === 0) {
    return { ok: false, format: 'unknown', complete: false, reasons: ['The file is empty.'], action: 'reject' };
  }
  if (bytes.length > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, format: detectFormat(bytes), complete: false, reasons: [`The file is larger than ${mb} MB.`], action: 'reject' };
  }
  const format = detectFormat(bytes);
  if (format === 'unknown') {
    return { ok: false, format, complete: false, reasons: ['This does not look like a PNG, JPEG or WebP image.'], action: 'reject' };
  }
  if (format === 'heic') {
    return { ok: false, format, complete: true, reasons: ['HEIC photos must be converted to PNG or JPEG first.'], action: 'redraw' };
  }
  let complete;
  const flags = { progressive: false };
  if (format === 'png') complete = checkPng(bytes, reasons);
  else if (format === 'jpeg') complete = checkJpeg(bytes, reasons, flags);
  else complete = checkWebp(bytes, reasons);

  if (!complete) return { ok: false, format, complete, reasons, action: 'redraw' };
  if (flags.progressive) {
    reasons.push('This is a progressive JPEG; please re-save it as a normal PNG or JPEG.');
    return { ok: false, format, complete, reasons, action: 'redraw' };
  }
  return { ok: true, format, complete, reasons, action: 'accept' };
}
