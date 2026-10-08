// Minimal .xlsx (zip, stored) writer used by the Prep / Appointments exports. No dependencies.
// sheets: [{ name, aoa: [[cell,...],...] }] -> Blob
export function buildXlsx(sheets) {
  const xmlEscape = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const colName = (n) => { let s = ''; let x = n; while (x > 0) { const rem = (x - 1) % 26; s = String.fromCharCode(65 + rem) + s; x = Math.floor((x - 1) / 26); } return s; };
  const nsMain = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const nsRel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const nsPkgRel = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const nsCT = 'http://schemas.openxmlformats.org/package/2006/content-types';
  const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const sheetXmls = sheets.map((sheet) => {
    const rowsXml = sheet.aoa.map((cells, rIdx) => {
      const rowNum = rIdx + 1;
      const cellsXml = cells.map((val, cIdx) => {
        const ref = colName(cIdx + 1) + rowNum;
        const str = String(val == null ? '' : val);
        const isNum = str.trim() !== '' && !Number.isNaN(Number(str)) && /^-?\d+(\.\d+)?$/.test(str.trim());
        if (isNum) return '<c r="' + ref + '"><v>' + xmlEscape(str.trim()) + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(str) + '</t></is></c>';
      }).join('');
      return '<row r="' + rowNum + '">' + cellsXml + '</row>';
    }).join('');
    return decl + '<worksheet xmlns="' + nsMain + '"><sheetData>' + rowsXml + '</sheetData></worksheet>';
  });
  const overrides = sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');
  const contentTypes = decl + '<Types xmlns="' + nsCT + '">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides + '</Types>';
  const rootRels = decl + '<Relationships xmlns="' + nsPkgRel + '"><Relationship Id="rId1" Type="' + nsRel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const sheetTags = sheets.map((s, i) => '<sheet name="' + xmlEscape(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('');
  const workbook = decl + '<workbook xmlns="' + nsMain + '" xmlns:r="' + nsRel + '"><sheets>' + sheetTags + '</sheets></workbook>';
  const wbRelTags = sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + nsRel + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('');
  const workbookRels = decl + '<Relationships xmlns="' + nsPkgRel + '">' + wbRelTags + '</Relationships>';
  const files = [
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
  ];
  sheetXmls.forEach((xml, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: xml }));
  const crcTable = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i += 1) { let c = i; for (let k = 0; k < 8; k += 1) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } t[i] = c >>> 0; } return t; })();
  const crc32 = (bytes) => { let crc = 0xffffffff; for (let i = 0; i < bytes.length; i += 1) { crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8); } return (crc ^ 0xffffffff) >>> 0; };
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const pushU16 = (arr, v) => { arr.push(v & 0xff, (v >>> 8) & 0xff); };
  const pushU32 = (arr, v) => { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); };
  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.data);
    const crc = crc32(dataBytes);
    const local = [];
    pushU32(local, 0x04034b50); pushU16(local, 20); pushU16(local, 0); pushU16(local, 0); pushU16(local, 0); pushU16(local, 0);
    pushU32(local, crc); pushU32(local, dataBytes.length); pushU32(local, dataBytes.length); pushU16(local, nameBytes.length); pushU16(local, 0);
    const localHeader = new Uint8Array(local);
    chunks.push(localHeader, nameBytes, dataBytes);
    const cen = [];
    pushU32(cen, 0x02014b50); pushU16(cen, 20); pushU16(cen, 20); pushU16(cen, 0); pushU16(cen, 0); pushU16(cen, 0); pushU16(cen, 0);
    pushU32(cen, crc); pushU32(cen, dataBytes.length); pushU32(cen, dataBytes.length); pushU16(cen, nameBytes.length); pushU16(cen, 0); pushU16(cen, 0); pushU16(cen, 0); pushU16(cen, 0); pushU32(cen, 0); pushU32(cen, offset);
    central.push({ header: new Uint8Array(cen), name: nameBytes });
    offset += localHeader.length + nameBytes.length + dataBytes.length;
  });
  const centralStart = offset;
  let centralSize = 0;
  central.forEach((entry) => { chunks.push(entry.header, entry.name); centralSize += entry.header.length + entry.name.length; });
  const end = [];
  pushU32(end, 0x06054b50); pushU16(end, 0); pushU16(end, 0); pushU16(end, files.length); pushU16(end, files.length); pushU32(end, centralSize); pushU32(end, centralStart); pushU16(end, 0);
  chunks.push(new Uint8Array(end));
  return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
