import test from "node:test";
import assert from "node:assert/strict";
import { calculateMasterLevelMaterials, createMasterSkillInputs } from "../lib/mastersLevelCalculator.mjs";

test("calculates verified full Master totals", () => {
  const cases = [
    ["Valora", 167740, 275, 21150],
    ["Pan", 201290, 275, 21000],
    ["Roman", 502220, 440, 81000],
    ["Cassia", 918340, 1820, 413500],
    ["Guinevere", 854450, 660, 156500],
    ["Wilson", 342380, 330, 63000],
  ];
  for (const [masterName, affinity, emblems, manuscripts] of cases) {
    const skills = createMasterSkillInputs(masterName).map((skill) => ({ ...skill, target: 99 }));
    const result = calculateMasterLevelMaterials({ masterName, currentLevel: 0, targetLevel: 100, skills });
    assert.equal(result.affinity, affinity, `${masterName} affinity`);
    assert.equal(result.emblems, emblems, `${masterName} emblems`);
    assert.equal(result.manuscripts, manuscripts, `${masterName} manuscripts`);
  }
});

test("subtracts current relationship and skill progress", () => {
  const skills = createMasterSkillInputs("Valora");
  skills[0] = { ...skills[0], current: 2, target: 4 };
  const result = calculateMasterLevelMaterials({ masterName: "Valora", currentLevel: 8, targetLevel: 20, skills });
  assert.equal(result.affinity, 4920);
  assert.equal(result.emblems, 15);
  assert.equal(result.manuscripts, 350);
});
