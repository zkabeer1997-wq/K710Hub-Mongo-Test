// Styled .xlsx writer for the rally export. No dependencies.
//
// A sheet is { name, widths: [excel units], rows: [[cell]], merges: [[r1, c1, r2, c2]] (0-based, inclusive), frozenRows }.
// A cell is a string / number, or { v, bold, size, font, bg: '#RRGGBB', color, align: 'center' | 'left' }.
import { zipStored } from './zipStored.mjs';

const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function columnName(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

const cellValue = (cell) => (cell !== null && typeof cell === 'object' ? cell.v : cell);
const argb = (hex) => `FF${String(hex).replace('#', '').toUpperCase()}`;

export function buildStyledXlsx(sheets) {
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const fontIndex = new Map();
  const fillIndex = new Map();
  const xfIndex = new Map();

  function styleOf(cell) {
    if (cell === null || typeof cell !== 'object') return 0;
    const { bold, size, font, bg, color, align } = cell;
    if (!bold && !size && !font && !bg && !color && !align) return 0;
    const key = JSON.stringify([!!bold, size || 0, font || '', bg || '', color || '', align || '']);
    if (xfIndex.has(key)) return xfIndex.get(key);
    const fontKey = JSON.stringify([!!bold, size || 11, font || 'Calibri', color || '']);
    if (!fontIndex.has(fontKey)) {
      fontIndex.set(fontKey, fonts.length);
      fonts.push(`<font>${bold ? '<b/>' : ''}<sz val="${size || 11}"/>${color ? `<color rgb="${argb(color)}"/>` : ''}<name val="${esc(font || 'Calibri')}"/></font>`);
    }
    let fillId = 0;
    if (bg) {
      if (!fillIndex.has(bg)) {
        fillIndex.set(bg, fills.length);
        fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="${argb(bg)}"/><bgColor indexed="64"/></patternFill></fill>`);
      }
      fillId = fillIndex.get(bg);
    }
    const alignment = align ? `<alignment horizontal="${align}" vertical="center"/>` : '';
    const id = xfs.length;
    xfs.push(`<xf numFmtId="0" fontId="${fontIndex.get(fontKey)}" fillId="${fillId}" borderId="0" xfId="0" applyFont="1"${bg ? ' applyFill="1"' : ''}${align ? ' applyAlignment="1"' : ''}>${alignment}</xf>`);
    xfIndex.set(key, id);
    return id;
  }

  const sheetXmls = sheets.map((sheet) => {
    const rowsXml = sheet.rows.map((cells, rIdx) => {
      const rowNum = rIdx + 1;
      const cellsXml = cells.map((cell, cIdx) => {
        const value = cellValue(cell);
        const style = styleOf(cell);
        const ref = columnName(cIdx + 1) + rowNum;
        const s = style ? ` s="${style}"` : '';
        if (value === '' || value == null) return style ? `<c r="${ref}"${s}/>` : '';
        if (typeof value === 'number') return `<c r="${ref}"${s}><v>${value}</v></c>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
      }).join('');
      return `<row r="${rowNum}">${cellsXml}</row>`;
    }).join('');
    const cols = (sheet.widths || []).length
      ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';
    const merges = (sheet.merges || []).length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(([r1, c1, r2, c2]) => `<mergeCell ref="${columnName(c1 + 1)}${r1 + 1}:${columnName(c2 + 1)}${r2 + 1}"/>`).join('')}</mergeCells>`
      : '';
    const frozen = sheet.frozenRows
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.frozenRows}" topLeftCell="A${sheet.frozenRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '';
    return `${DECL}<worksheet xmlns="${NS_MAIN}">${frozen}${cols}<sheetData>${rowsXml}</sheetData>${merges}</worksheet>`;
  });

  const styles = `${DECL}<styleSheet xmlns="${NS_MAIN}"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs></styleSheet>`;
  const overrides = sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const contentTypes = `${DECL}<Types xmlns="${NS_CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`;
  const rootRels = `${DECL}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const sheetTags = sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const workbook = `${DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${sheetTags}</sheets></workbook>`;
  const relTags = sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  const stylesRel = `<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>`;
  const workbookRels = `${DECL}<Relationships xmlns="${NS_PKG_REL}">${relTags}${stylesRel}</Relationships>`;

  const files = [
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: styles },
    ...sheetXmls.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml })),
  ];
  return zipStored(files);
}
