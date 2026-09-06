export const TTG_TIERS = Object.freeze([
  { tier: 1, from: 1, to: 20, cost: 20, outcomes: [[1, .65], [2, .25], [3, .10]] },
  { tier: 2, from: 21, to: 40, cost: 50, outcomes: [[2, .85], [3, .15]] },
  { tier: 3, from: 41, to: 60, cost: 100, outcomes: [[3, .85], [4, .125], [5, .02], [6, .005]] },
  { tier: 4, from: 61, to: 80, cost: 130, outcomes: [[3, .75], [4, .15], [5, .05], [6, .03], [7, .01], [8, .005], [9, .005]] },
  { tier: 5, from: 81, to: 100, cost: 160, outcomes: [[3, .70], [4, .12], [5, .09], [6, .04], [7, .015], [8, .01], [9, .01], [10, .005], [11, .005], [12, .005]] },
].map((row) => ({ ...row, expected: row.outcomes.reduce((sum, [value, chance]) => sum + value * chance, 0), min: row.outcomes[0][0], max: row.outcomes.at(-1)[0] })));

export const CHARM_LEVELS = Object.freeze([
  null, [5,5,9,205700],[40,15,3,82300],[60,40,4,82000],[80,100,3,82000],
  [100,200,6,124000],[120,300,5,124000],[140,400,5,124000],[200,400,5,124000],
  [300,400,5,124000],[420,420,5,124000],[560,420,5,124000],[580,600,4,96000],
  [610,780,4,96000],[645,960,4,96000],[685,1140,4,96000],[730,1320,4,96000],
  [780,1500,4,96000],[835,1680,4,96000],[895,1860,4,96000],[960,2040,4,96000],
  [1030,2220,4,96000],[1105,2400,4,96000],
].map((row, level) => row && ({ level, guides: row[0], designs: row[1], health: row[2], lethality: row[2], power: row[3] })));

export const PETS = Object.freeze([
  ["Gray Wolf",1,60,.55],["Lynx",1,60,.55],["Cave Hyena",2,70,.7],["Giant Boar",2,70,.7],
  ["Lion",3,80,.8],["Snow Ape",3,80,.8],["Mighty Bison",4,90,.9],["Giant Rhino",4,90,.9],
  ["Great Moose",5,100,1],["Alpha Black Panther",5,100,1],["Ironclad War Elephant",6,100,1],
  ["Regal White Lion",6,100,1],["Ironclad War Bear",7,100,1],["Golden Dragon",7,100,1],
].map(([name,generation,maxLevel,costScale]) => ({ name,generation,maxLevel,costScale })));

export const PET_ADVANCEMENT = Object.freeze({
  10:[35,0,0],20:[70,0,0],30:[110,15,0],40:[145,35,0],50:[220,50,10],
  60:[290,65,20],70:[365,85,40],80:[440,100,60],90:[585,115,80],100:[730,135,100],
});

export const HERO_XP_MILESTONES = Object.freeze([
  { level:20, xp:52650, mithril:10, mythic:5 },{ level:40, xp:75050, mithril:20, mythic:5 },
  { level:60, xp:93100, mithril:30, mythic:5 },{ level:80, xp:121600, mithril:40, mythic:10 },
  { level:100, xp:159600, mithril:50, mythic:10 },
]);
export const HERO_SLOT_STAT = Object.freeze({ Helmet:"Lethality", Boots:"Lethality", Chest:"Health", Gloves:"Health" });

const governorRaw = [
["Green",1500,15,0,224400,9.35,2],["Green II",3800,40,0,306000,3.4,2.5],["Blue",7000,70,0,408000,4.25,3],["Blue II",9700,95,0,510000,4.25,3.5],["Blue III",1000,10,45,612000,4.25,4],["Blue IV",1000,10,50,714000,4.25,4.5],
["Purple",1500,15,60,816000,4.25,5],["Purple +1",1500,15,70,885360,2.89,5],["Purple +2",6500,65,40,954720,2.89,5],["Purple +3",8000,80,50,1024080,2.89,5],
["Purple T1",10000,95,60,1093440,2.89,6],["Purple T1 +1",11000,110,70,1162800,2.89,6],["Purple T1 +2",13000,130,85,1232160,2.89,6],["Purple T1 +3",15000,160,100,1301520,2.89,6],
["Gold",22000,220,40,1362720,2.55,7],["Gold +1",23000,230,40,1423920,2.55,7],["Gold +2",25000,250,45,1485120,2.55,7],["Gold +3",26000,260,45,1546320,2.55,7],
["Gold T1",28000,280,45,1607520,2.55,8],["Gold T1 +1",30000,300,55,1668720,2.55,8],["Gold T1 +2",32000,320,55,1729920,2.55,8],["Gold T1 +3",35000,340,55,1791120,2.55,8],
["Gold T2",38000,390,55,1852320,2.55,9],["Gold T2 +1",43000,430,75,1913520,2.55,9],["Gold T2 +2",45000,460,80,1974720,2.55,9],["Gold T2 +3",48000,500,85,2040000,2.55,9],
["Gold T3",60000,600,120,2097120,2.55,10],["Gold T3 +1",70000,700,140,2158320,2.55,10],["Gold T3 +2",80000,800,160,2219520,2.55,10],["Gold T3 +3",90000,900,180,2280000,2.52,10],
["Red",108000,1080,220,2340000,2.5,12],["Red +1",114000,1140,230,2400000,2.5,12],["Red +2",121000,1210,240,2460000,2.5,12],["Red +3",128000,1280,250,2520000,2.5,12],
["Red T1",154000,1540,300,2580000,2.5,14],["Red T1 +1",163000,1630,320,2640000,2.5,14],["Red T1 +2",173000,1730,340,2700000,2.5,14],["Red T1 +3",183000,1830,360,2760000,2.5,14],
["Red T2",220000,2200,430,2820000,2.5,16.5],["Red T2 +1",233000,2330,460,2880000,2.5,16.5],["Red T2 +2",247000,2470,490,2940000,2.5,16.5],["Red T2 +3",264000,2640,520,3000000,2.5,16.5],
["Red T3",288000,2880,570,3066000,2.75,19.5],["Red T3 +1",302000,3020,600,3132000,2.75,19.5],["Red T3 +2",317000,3170,630,3198000,2.75,19.5],["Red T3 +3",333000,3330,660,3264000,2.75,19.5],
["Red T4",358000,3580,720,3330000,2.75,23],["Red T4 +1",384000,3840,770,3396000,2.75,23],["Red T4 +2",403000,4030,810,3462000,2.75,23],["Red T4 +3",423000,4230,850,3528000,2.75,23],
["Red T5",451000,4510,910,3600000,3,26.5],["Red T5 +1",479000,4790,970,3672000,3,26.5],["Red T5 +2",507000,5070,1030,3744000,3,26.5],["Red T5 +3",535000,5350,1090,3816000,3,26.5],
["Red T6",548000,5480,1110,3888000,3,30],["Red T6 +1",565000,5650,1140,3960000,3,30],["Red T6 +2",582000,5820,1170,4032000,3,30],["Red T6 +3",599000,5990,1210,4104000,3,30],
];
export const GOVERNOR_GEAR_LEVELS = Object.freeze(governorRaw.map(([tier,satin,threads,visions,power,statGain,setBonus], index) => ({ index, tier,satin,threads,visions,power,statGain,setBonus })));

export const MASTERS = Object.freeze(["Valora","Pan","Roman","Cassia","Guinevere","Wilson"]);
export const MASTER_RELATIONSHIPS = Object.freeze([
  { level:0, affinity:1000, emblems:0, buff:0 },{ level:10, affinity:340, emblems:5, buff:2.85 },
  { level:20, affinity:540, emblems:10, buff:4.2 },{ level:30, affinity:760, emblems:15, buff:5.55 },
  { level:40, affinity:1080, emblems:20, buff:6.9 },{ level:50, affinity:1500, emblems:25, buff:8.25 },
  { level:60, affinity:2000, emblems:30, buff:9.6 },{ level:70, affinity:2500, emblems:35, buff:10.95 },
  { level:80, affinity:3000, emblems:40, buff:12.3 },{ level:90, affinity:3500, emblems:45, buff:13.65 },
  { level:100, affinity:3950, emblems:50, buff:15 },
]);
