import { ExternalError, cleanText, toInt, toNum } from './sanitize.mjs';

function visibleText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/**
 * Tolerant parse of https://ks-atlas.com/kingdom/710. Atlas is a client-rendered
 * single-page app: as of capture the server-sent HTML carries no kingdom numbers
 * (its data API is disallowed for robots), so this usually yields { available:false }.
 * If Atlas ever server-renders "Atlas Score 57.59" / "Rank #107" / a tier, we pick it up.
 */
export function parseAtlasPage(html) {
  if (typeof html !== 'string' || html.length < 200) throw new ExternalError('shape', 'Atlas page was empty');
  const text = visibleText(html);
  const score = /atlas score[^0-9]{0,24}(\d{1,3}(?:\.\d{1,2})?)/i.exec(text);
  const rank = /\brank\s*#?\s*(\d{1,5})\b/i.exec(text) || /#(\d{1,5})\s+(?:overall|rank)/i.exec(text);
  const tier = /\b([SABCD])[- ]tier\b/i.exec(text);
  const top = /top\s+(\d{1,2}(?:\.\d)?)\s*%/i.exec(text);
  const out = {
    score: score ? toNum(score[1], { min: 0, max: 1000 }) : null,
    rank: rank ? toInt(rank[1], { min: 1, max: 100000 }) : null,
    tier: tier ? `${tier[1].toUpperCase()}-Tier` : null,
    topPercent: top ? `${top[1]}%` : null,
  };
  out.available = out.score !== null || out.rank !== null;
  out.title = cleanText((/<title>([^<]{0,200})<\/title>/i.exec(html) || [])[1], 120);
  return out;
}
