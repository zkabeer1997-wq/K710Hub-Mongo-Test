// Helpers shared by the template build script, scan:eval and the tests: cut digit templates from labelled tiles.
import { tileGlyphs } from './digits.mjs';

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}[]} tiles canonical tiles
 * @param {number[]} quantities label of each tile (same order)
 * @param {{ source?: string, skip?: number[] }} [opts] skip = tile indexes to leave out (e.g. digits behind a shield icon)
 * @returns {{ templates: {digit:string, source:string, grid:Float32Array}[], skipped: string[] }}
 */
export function harvestDigitTemplates(tiles, quantities, { source = 'image', skip = [] } = {}) {
  const templates = [];
  const skipped = [];
  tiles.forEach((tile, i) => {
    if (skip.includes(i) || quantities[i] === null || quantities[i] === undefined) return;
    const text = String(quantities[i]);
    const glyphs = tileGlyphs(tile);
    if (glyphs.length !== text.length) { skipped.push(`${source}#${i} (${text})`); return; }
    glyphs.forEach((g, k) => templates.push({ digit: text[k], source: `${source}#${i}`, grid: g.grid }));
  });
  return { templates, skipped };
}
