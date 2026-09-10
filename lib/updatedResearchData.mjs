export const RESEARCH_WORKBOOK = Object.freeze({
  name: "Kingshot Academy & War Academy Research Detailed",
  suppliedAt: "2026-09-10",
  limitations: "Workbook totals marked with ~, approximate, K, M, or B are shown as reference estimates and are never used as exact per-level calculator inputs.",
});

export const ACADEMY_WORKBOOK_SUMMARY = Object.freeze({
  building: { levels: 30, unlockTownCenter: 9, maxResearchSpeed: 3, baseTime: "~32d 6h 33m", bread: "~525.9M", wood: "~526.8M", stone: "~103.4M", iron: "~26.3M" },
  trees: [
    { name: "Growth / Development", technologies: 45, levels: 129, baseTime: "883d 2h 56m", power: "2.9M" },
    { name: "Economy", technologies: 44, levels: 132, baseTime: "166d 3h 43m", power: "437.7K" },
    { name: "Battle", technologies: 102, levels: 453, baseTime: "3781d 22h 42m", power: "17.7M" },
  ],
  priorities: [
    ["Tool Enhancement", "Research Speed", "Highest long-term return when completed early."],
    ["Command Tactics", "March Queues", "Critical utility for active accounts."],
    ["Tooling Up", "Construction Speed", "Accelerates city progression."],
    ["Trainer Tools", "Training Speed", "Improves troop production."],
    ["Bandaging", "Healing Speed", "Useful before sustained PvP."],
    ["Camp Expansion", "Training Capacity", "Situational capacity gain."],
    ["Ward Expansion", "Infirmary Capacity", "Useful before heavy combat."],
  ],
});

export const WAR_ACADEMY_WORKBOOK_SUMMARY = Object.freeze({
  buildingStages: [
    ["TG1", 0, 0, "0.50%", "Starting level"], ["TG2", 355, 0, "1.00%", ""],
    ["TG3", 535, 0, "1.50%", ""], ["TG4", 630, 0, "2.00%", ""],
    ["TG5", 750, 0, "2.50%", "Unlocks the full T11 path"], ["TG6", 405, 25, "3.00%", "TTG starts"],
    ["TG7", 486, 37, "6.00%", ""], ["TG8", 486, 54, "9.00%", ""],
    ["TG9", 567, 79, "12.00%", ""], ["TG10", 706, 187, "15.00%", ""],
  ],
  paths: [
    ["Unlock one T11 troop", "13,421 Dust", "271 days", "Workbook aggregate"],
    ["Unlock all three T11 troops", "40,263 Dust", "813 days", "Workbook aggregate"],
    ["Fully max one troop tree", "~27.3K Dust", "556d 8h", "Workbook estimate"],
    ["Fully max all three trees", "~81.9K Dust", "1,669 days", "Workbook estimate"],
  ],
  unlockOrder: ["Raise War Academy to TG5", "Max Truegold Battalion", "Raise Health and Lethality gates", "Raise Attack and Defense to Lv12", "Research the T11 unlock node", "Add training and healing reductions"],
  acquisition: ["Gold exchange: 5,000 Gold = 1 Truegold Dust, up to 20 per day.", "Truegold exchange: 10 Truegold = 13 Dust, up to 200 exchanges per day.", "The workbook recommends protecting Truegold for buildings and preferring Gold-to-Dust exchanges when practical."],
});

export const ADVANCED_WORKBOOK_SUMMARY = Object.freeze({
  totals: [["Technologies", "92"], ["Levels", "1,010"], ["Power", "~76.9M"], ["Truegold Dust", "~625,499"], ["Tempered Truegold", "~21,549"], ["Bread / Wood", "~8.6175B each"], ["Base time", "~14,775 days"]],
  order: [
    ["Foundation", "War Academy TG5", "Hard gate"],
    ["Utility", "Chests of Gold, Weaponry, Barracks, Intel, Infirmaries, Bandaging, Limited Supply", "Low or no TTG"],
    ["Combat I", "First Attack, Defense, Lethality and Health lines", "Low or no TTG"],
    ["Combat II–III", "Continue the matching troop lines and capacity nodes", "TTG begins and scales"],
    ["Combat IV–V", "End-game combat, Armaments, Armor and rally nodes", "High TTG"],
  ],
  notes: ["Runs in an independent research queue.", "Does not unlock higher troop tiers.", "Tempered Truegold competes directly with TG6+ building upgrades.", "The workbook recommends utility first, followed by combat lines for the account's primary troop type."],
  discrepancies: ["Truegold Weaponry Lv1–10 rows sum to 2.90M Bread/Wood and 58K Gold, not the workbook TOTAL row's 2.85M and 57K. The exact level rows are authoritative in this planner."],
});

export const RESEARCH_DATA_COUNTS = Object.freeze({
  academy: { technologies: 191, levels: 720 },
  warAcademy: { technologies: 30, levels: 264 },
  advanced: { technologies: 92, levels: 1010 },
});
