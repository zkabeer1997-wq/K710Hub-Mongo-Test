export const CONSTRUCTION_TIERS = Object.freeze([
  "TG1", "TG2", "TG3", "TG4", "TG5", "TG6", "TG7", "TG8", "TG9", "TG10",
]);

const tier = (trueGold, temperedTrueGold = 0) => Object.freeze({ trueGold, temperedTrueGold });

export const UPDATED_CONSTRUCTION_BUILDINGS = Object.freeze([
  { id: "town-center", name: "Town Center", priority: 1, costs: [tier(660), tier(790), tier(1190), tier(1400), tier(1675), tier(900, 60), tier(1080, 90), tier(1080, 120), tier(1260, 180), tier(1575, 420)] },
  { id: "embassy", name: "Embassy", priority: 3, costs: [tier(165), tier(195), tier(295), tier(350), tier(415), tier(225, 13), tier(270, 19), tier(270, 30), tier(315, 43), tier(391, 103)] },
  { id: "command-center", name: "Command Center", priority: 4, costs: [tier(130), tier(155), tier(235), tier(280), tier(335), tier(180, 13), tier(216, 19), tier(216, 24), tier(252, 36), tier(315, 84)] },
  { id: "infirmary", name: "Infirmary", priority: 4, costs: [tier(130), tier(155), tier(235), tier(280), tier(335), tier(180, 12), tier(216, 18), tier(216, 24), tier(252, 36), tier(315, 84)] },
  { id: "barracks", name: "Barracks", priority: 2, costs: [tier(295), tier(355), tier(535), tier(630), tier(750), tier(405, 25), tier(486, 37), tier(486, 54), tier(567, 79), tier(706, 187)] },
  { id: "stable", name: "Stable", priority: 2, costs: [tier(295), tier(355), tier(535), tier(630), tier(750), tier(405, 25), tier(486, 37), tier(486, 54), tier(567, 79), tier(706, 187)] },
  { id: "range", name: "Range", priority: 2, costs: [tier(295), tier(355), tier(535), tier(630), tier(750), tier(405, 25), tier(486, 37), tier(486, 54), tier(567, 79), tier(706, 187)] },
  { id: "war-academy", name: "War Academy", priority: 5, costs: [tier(0), tier(355), tier(535), tier(630), tier(750), tier(405, 25), tier(486, 37), tier(486, 54), tier(567, 79), tier(706, 187)] },
]);

// Approximate Town Center totals supplied in the workbook. These values are
// displayed separately and never presented as exact per-stage requirements.
export const TOWN_CENTER_APPROXIMATE = Object.freeze([
  { tier: "TG1", bread: 335e6, wood: 335e6, stone: 65e6, iron: 16.5e6, seconds: 35 * 86400 },
  { tier: "TG2", bread: 360e6, wood: 360e6, stone: 70e6, iron: 18e6, seconds: 45 * 86400 },
  { tier: "TG3", bread: 395e6, wood: 395e6, stone: 75e6, iron: 19.5e6, seconds: 55 * 86400 },
  { tier: "TG4", bread: 410e6, wood: 410e6, stone: 80e6, iron: 20.5e6, seconds: 60 * 86400 },
  { tier: "TG5", bread: 420e6, wood: 420e6, stone: 80e6, iron: 21e6, seconds: 70 * 86400 },
  { tier: "TG6", bread: 480e6, wood: 480e6, stone: 95e6, iron: 24e6, seconds: 75 * 86400 },
  { tier: "TG7", bread: 500e6, wood: 500e6, stone: 105e6, iron: 27e6, seconds: 90 * 86400 },
  { tier: "TG8", bread: 650e6, wood: 650e6, stone: 130e6, iron: 33e6, seconds: 100 * 86400 },
]);

export const TOWN_CENTER_PREREQUISITES = Object.freeze({
  TG1: [{ id: "embassy", tier: "30" }, { id: "academy", name: "Academy", tier: "30" }],
  TG2: [{ id: "embassy", tier: "TG1" }, { id: "stable", tier: "TG1" }],
  TG3: [{ id: "embassy", tier: "TG2" }, { id: "barracks", tier: "TG2" }],
  TG4: [{ id: "embassy", tier: "TG3" }, { id: "range", tier: "TG3" }],
  TG5: [{ id: "embassy", tier: "TG4" }, { id: "stable", tier: "TG4" }],
  TG6: [{ id: "embassy", tier: "TG5" }, { id: "barracks", tier: "TG5" }],
  TG7: [{ id: "embassy", tier: "TG6" }, { id: "range", tier: "TG6" }],
  TG8: [{ id: "embassy", tier: "TG7" }, { id: "stable", tier: "TG7" }],
  TG9: [{ id: "embassy", tier: "TG8", derived: true }, { id: "barracks", tier: "TG8", derived: true }],
  TG10: [{ id: "embassy", tier: "TG9", derived: true }, { id: "range", tier: "TG9", derived: true }],
});

export const CONSTRUCTION_SOURCE = Object.freeze({
  name: "Kingshot TG1–TG10 Construction Costs",
  suppliedAt: "2026-09-10",
  limitations: "True Gold and Tempered True Gold reproduce the workbook's full five-stage tier totals; its summary labels them approximate. Town Center secondary resources and base time are approximate through TG8. TG1–TG8 prerequisites are explicitly listed in the workbook; TG9–TG10 continue its stated Embassy-plus-rotating-troop-building pattern and remain pending in-game confirmation. Exact per-substage costs were not supplied.",
});
