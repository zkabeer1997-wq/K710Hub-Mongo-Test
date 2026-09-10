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
  "masters-pack-optimizer",
  "account-progression",
  "updated-hero-gear",
  "updated-governor-gear",
  "updated-charms",
  "updated-masters",
  "updated-pets",
  "updated-construction",
  "updated-research",
]);

export function isSupportedToolKey(value) {
  return typeof value === "string" && SUPPORTED_TOOL_KEYS.includes(value);
}
