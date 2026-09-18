// Placeholder economy data for the Governor Gear Sailing Tool, mirroring
// lib/charmToolData.mjs's role for the Charms Sailing (Wavebound) tool: a
// checked-in default that keeps the calculator usable, but every number
// here is a planning assumption until an admin corrects it from Pack
// Editing (Admin > Website > Pack Editing > Governor Gear Sailing Tool)
// with real in-game costs.
//
// Index N = the Satin/Gilded Threads cost to go from tier N-1 to tier N,
// where tier N matches GOVERNOR_GEAR_OPTIONS[N] (58 tiers total, shared
// across all six gear pieces - same shape as CHARM_COSTS being one table
// shared across all 18 charms).
export const GOVERNOR_GEAR_TIER_COSTS = [
  null,
  [56, 56], [93, 93], [132, 132], [173, 173], [215, 215], [259, 259], [304, 304],
  [351, 351], [400, 400], [450, 450], [502, 502], [555, 555], [610, 610], [667, 667],
  [725, 725], [785, 785], [846, 846], [909, 909], [974, 974], [1040, 1040], [1108, 1108],
  [1177, 1177], [1248, 1248], [1321, 1321], [1395, 1395], [1471, 1471], [1548, 1548],
  [1627, 1627], [1708, 1708], [1790, 1790], [1874, 1874], [1959, 1959], [2046, 2046],
  [2135, 2135], [2225, 2225], [2317, 2317], [2410, 2410], [2505, 2505], [2602, 2602],
  [2700, 2700], [2800, 2800], [2901, 2901], [3004, 3004], [3109, 3109], [3215, 3215],
  [3323, 3323], [3432, 3432], [3543, 3543], [3656, 3656], [3770, 3770], [3886, 3886],
  [4003, 4003], [4122, 4122], [4243, 4243], [4365, 4365], [4489, 4489], [4614, 4614],
];
