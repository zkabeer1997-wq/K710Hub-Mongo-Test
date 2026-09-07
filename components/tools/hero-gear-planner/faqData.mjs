export const HERO_GEAR_FAQ = [
  {
    q: 'What is the difference between Hero Gear and Governor Gear?',
    a: 'Hero Gear is equipped on individual heroes and its stats only apply when that hero leads a march or garrison. Governor Gear is equipped on your governor and its bonuses apply account-wide, all the time. They use separate resources and separate optimizers - this planner only covers Hero Gear.',
  },
  {
    q: 'Is Red gear worth it for a free-to-play account?',
    a: 'Yes, but the return slows down a lot after the first couple of pieces. Early Red pieces convert a large chunk of banked Enhancement XP and Forgehammers into a real stat jump; later pieces cost proportionally more Mithril for a smaller marginal gain. Conservative strategy timed to expedition milestones (120/160/200) is the most F2P-efficient path.',
  },
  {
    q: 'Do troop stats matter more than squad Lethality/Health shown in battle reports?',
    a: 'Squad Lethality/Health in a battle report already includes hero gear, charms, research, and buffs baked in. Troop-type stats from gear are one input into that total, not the whole story - which is why this planner optimizes gear allocation rather than promising a specific squad-power number.',
  },
  {
    q: 'Which event shop items should I prioritize for Hero Gear progress?',
    a: 'Enhancement XP Parts (Green and Purple) and Forgehammers almost always have the best exchange rate in rotating event shops. Mythic Gear and Mithril are rarer and usually worth holding for guaranteed-value bundles rather than spending on discretionary shop rotations.',
  },
  {
    q: 'What happens if I respec or reforge a gear piece?',
    a: 'Reforging resets a piece\'s Enhancement Level but returns a portion of the XP that was sunk into it as banked Enhancement XP, which can be redirected to another piece. Mastery Level is untouched by a reforge. This planner\'s "Include XP reforge" toggle accounts for that recovered XP when it builds a plan.',
  },
  {
    q: 'Why did the optimizer only gain me a small amount of stat percentage?',
    a: 'Diminishing returns are expected once your account is past early Enhancement levels - each additional level costs more XP for a smaller percentage step, especially near a gear piece\'s current tier ceiling. A small optimizer gain usually means your resources are already well-allocated, not that the tool found nothing to do.',
  },
  {
    q: 'What is "XP Banking" and why is it recommended?',
    a: 'Banking means holding unspent Enhancement XP Parts rather than converting them immediately, so you can direct the exact amount needed to whichever piece the optimizer prioritizes next. Converting early and letting XP sit on a lower-priority piece is the most common way players waste Enhancement resources.',
  },
  {
    q: 'What does "near-miss analysis" show me?',
    a: 'It flags upgrades that are just out of reach - typically within about 10% more resources of hitting the next Mastery breakpoint or tier threshold. It is meant to help you decide whether to wait one more event cycle before spending, not to change the core recommendation.',
  },
  {
    q: 'Should I set a Town Center Level cap lower than my actual level?',
    a: 'Only if you are intentionally planning ahead of a Town Center upgrade, or want the plan to ignore gear tiers you cannot unlock yet. Most players should leave the cap at their current Town Center Level so the optimizer never recommends a tier you can\'t equip.',
  },
  {
    q: 'Can I mix build profiles, like Combat weighting for Cavalry and Growth weighting for Infantry?',
    a: 'Yes - switch the Build Profile to Custom and edit the per-troop, per-stat weights directly. The four preset profiles (Early Game Growth, Early Game Combat, Future-Proofed, Unweighted) are starting points, not the only valid configurations.',
  },
  {
    q: 'Do saved builds sync across devices?',
    a: 'Yes. Builds save to your account, not just this browser, as soon as you\'re signed in as a member - open this planner on any device while signed in and your saved builds and current inputs will be there.',
  },
  {
    q: 'Why is my optimizer button disabled?',
    a: 'The Optimize button stays disabled until every included troop type has valid Enhancement and Mastery levels entered and at least one resource field is filled in. Toggle a troop type off in the "Include" switch above its card if you don\'t want it considered yet.',
  },
];
