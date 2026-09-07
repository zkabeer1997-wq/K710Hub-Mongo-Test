export const SUPPORTED_TOOL_KEYS = Object.freeze([
  "charm-pack-optimizer",
  "wavebound-charms",
  "pet-pack-optimizer",
  "flamedragon-shop",
  "adventure-stall",
  "costs-construction",
  "costs-academy",
  "costs-war-academy",
  "costs-advanced-research",
  "ttg-production",
  "pet-progression",
  "governor-charm-stats",
  "hero-gear",
  "governor-gear",
  "masters",
  "account-progression",
]);

export function isSupportedToolKey(value) {
  return typeof value === "string" && SUPPORTED_TOOL_KEYS.includes(value);
}
