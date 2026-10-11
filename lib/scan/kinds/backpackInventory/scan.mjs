// backpack_inventory: reads Backpack > Resources (TG, TTG, TG Dust) and Backpack > Speedups (category x denomination
// x quantity) from a screenshot. Tiles are found in the image itself, so full, scrolled and cropped screenshots work.
// Nothing is guessed: an item not on the screenshot is reported as not found (never 0), and weak reads are flagged.
import { resizeToWidth } from '../../normalize.mjs';
import { locateTiles, cutTile } from './locate.mjs';
import { classifyTile, decodeTemplates, readDenomination, readCategory, readTileQuantity, frameName } from './tileReader.mjs';
import { MINUTES_BY_DENOMINATION, SPEEDUP_DENOMINATIONS, RESOURCE_IDS, MAX_QUANTITY } from './gameData.mjs';
import templatesJson from './templates.json' with { type: 'json' };

export const BACKPACK_TEMPLATES = decodeTemplates(templatesJson);
const MAX_READ_WIDTH = 1500;
const MIN_READ_WIDTH = 300;
const MIN_GRID_TILES = 4;

const FRAME_BY_DENOMINATION = Object.fromEntries(SPEEDUP_DENOMINATIONS.map((d) => [d.id, d.frame]));

function field(value, confidence, flags = [], extra = {}) {
  return { value, confidence, flags, ...extra };
}

function quantityField(q) {
  const flags = [...q.flags];
  let confidence = q.confidence;
  let value = q.value;
  if (value !== null && (value < 0 || value > MAX_QUANTITY)) { flags.push('quantity_out_of_range'); confidence = 0; value = null; }
  if (value === null && !flags.includes('no_digits')) flags.push('unreadable');
  return field(value, confidence, flags, { digits: q.digits, text: q.text });
}

function tileRect(t) { return { x: t.x, y: t.y, w: t.size, h: t.size }; }

function readSpeedupTile(tile, rect, templates, order) {
  const denomination = readDenomination(tile, templates);
  const category = readCategory(tile, templates);
  const quantity = quantityField(readTileQuantity(tile, templates));
  const frame = frameName(tile);
  const flags = [];
  let denomField = field(denomination.value, denomination.confidence, denomination.flags, { alternatives: denomination.alternatives });
  if (denomination.value && FRAME_BY_DENOMINATION[denomination.value] !== frame) {
    // frame colour is only a cross-check: when it disagrees the label read is held for review
    denomField = field(denomination.value, Math.min(denomination.confidence, 0.4), ['frame_colour_disagrees'], { alternatives: denomination.alternatives });
  }
  const catField = field(category.value, category.confidence, category.flags, { alternatives: category.alternatives });
  const minutes = denomField.value && quantity.value !== null ? MINUTES_BY_DENOMINATION[denomField.value] * quantity.value : null;
  return { id: `speedup:${order}`, denomination: denomField, category: catField, quantity, minutes, frame, tile: rect, flags };
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray|Uint8Array}} pixels
 * @param {{ kind: string, engine_version: string }} base
 */
export function scanBackpackInventory(pixels, base, templates = BACKPACK_TEMPLATES) {
  if (!pixels || !(pixels.width >= MIN_READ_WIDTH)) return { ...base, status: 'invalid_image', reasons: ['The image is too small to read. Use the full-size screenshot.'] };
  let px = pixels;
  let scale = 1;
  try {
    if (pixels.width > MAX_READ_WIDTH) { px = resizeToWidth(pixels, MAX_READ_WIDTH); scale = pixels.width / px.width; }
  } catch (e) {
    return { ...base, status: 'invalid_image', reasons: [e.message] };
  }
  const located = locateTiles(px);
  if (located.tiles.length === 0) {
    return { ...base, status: 'failed', reasons: ['We could not find the Backpack item tiles. Open Backpack > Resources or Backpack > Speedups, take a screenshot of the whole screen and try again.'] };
  }
  const back = (r) => ({ x: Math.round(r.x * scale), y: Math.round(r.y * scale), w: Math.round(r.w * scale), h: Math.round(r.h * scale) });
  const resources = Object.fromEntries(RESOURCE_IDS.map((id) => [id, { found: false, value: null, confidence: 0, flags: ['not_found'] }]));
  const speedups = [];
  let speedupTiles = 0; let resourceTiles = 0; let otherTiles = 0;
  located.tiles.forEach((t, i) => {
    const tile = cutTile(px, t);
    const cls = classifyTile(tile, templates);
    const rect = back(tileRect(t));
    if (cls.type === 'speedup') {
      speedupTiles += 1;
      speedups.push(readSpeedupTile(tile, rect, templates, i));
    } else if (cls.type === 'resource') {
      resourceTiles += 1;
      const q = quantityField(readTileQuantity(tile, templates));
      const conf = Math.min(q.confidence, cls.confidence);
      const prev = resources[cls.item];
      const reading = { found: true, value: q.value, confidence: conf, flags: [...q.flags], digits: q.digits, text: q.text, icon_confidence: cls.confidence, tile: rect };
      if (prev.found) {
        // the same item twice on one screenshot: keep the more confident, ask for a check
        const keep = conf >= prev.confidence ? reading : prev;
        resources[cls.item] = { ...keep, flags: [...keep.flags, 'seen_twice'], confidence: Math.min(keep.confidence, 0.5) };
      } else resources[cls.item] = reading;
    } else otherTiles += 1;
  });
  let tab = 'unknown';
  if (speedupTiles > 0 && speedupTiles >= resourceTiles) tab = 'speedups';
  else if (resourceTiles > 0) tab = 'resources';
  else if (otherTiles >= MIN_GRID_TILES) tab = 'resources'; // a grid of items without TG / TTG / Dust: scrolled past them or another tab
  const reasons = [];
  if (tab === 'unknown') {
    return { ...base, status: 'failed', tab, tile_count: located.tiles.length, reasons: ['This does not look like Backpack > Resources or Backpack > Speedups. Open one of those tabs, take a screenshot of the whole screen and try again.'] };
  }
  if (tab === 'resources' && resourceTiles === 0) reasons.push('TG, TTG and TG Dust are not on this screenshot (it may be scrolled past them, or be another Backpack tab).');
  return {
    ...base, status: 'ok', reasons, tab, tile_count: located.tiles.length, tile_size: Math.round(located.size * scale),
    other_tiles: otherTiles, resources: tab === 'resources' ? resources : null, speedups: tab === 'speedups' ? speedups : [],
  };
}
