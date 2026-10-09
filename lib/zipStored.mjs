// Minimal "stored" (uncompressed) zip writer. files: [{ name, data: string | Uint8Array }] -> Uint8Array. No dependencies.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const u16 = (arr, v) => { arr.push(v & 0xff, (v >>> 8) & 0xff); };
const u32 = (arr, v) => { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); };

export function zipStored(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc = crc32(dataBytes);
    const local = [];
    u32(local, 0x04034b50); u16(local, 20); u16(local, 0); u16(local, 0); u16(local, 0); u16(local, 0);
    u32(local, crc); u32(local, dataBytes.length); u32(local, dataBytes.length); u16(local, nameBytes.length); u16(local, 0);
    const localHeader = new Uint8Array(local);
    chunks.push(localHeader, nameBytes, dataBytes);
    const cen = [];
    u32(cen, 0x02014b50); u16(cen, 20); u16(cen, 20); u16(cen, 0); u16(cen, 0); u16(cen, 0); u16(cen, 0);
    u32(cen, crc); u32(cen, dataBytes.length); u32(cen, dataBytes.length); u16(cen, nameBytes.length);
    u16(cen, 0); u16(cen, 0); u16(cen, 0); u16(cen, 0); u32(cen, 0); u32(cen, offset);
    central.push({ header: new Uint8Array(cen), name: nameBytes });
    offset += localHeader.length + nameBytes.length + dataBytes.length;
  });
  const centralStart = offset;
  let centralSize = 0;
  central.forEach((entry) => {
    chunks.push(entry.header, entry.name);
    centralSize += entry.header.length + entry.name.length;
  });
  const end = [];
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length);
  u32(end, centralSize); u32(end, centralStart); u16(end, 0);
  chunks.push(new Uint8Array(end));
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  chunks.forEach((c) => { out.set(c, pos); pos += c.length; });
  return out;
}
