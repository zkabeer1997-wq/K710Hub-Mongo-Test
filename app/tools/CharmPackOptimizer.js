"use client";
import { useCallback, useMemo, useState } from "react";
import { parseCharmSelections } from "../../lib/powerProfiles.mjs";

import { CHARM_COSTS, CHARM_PACKS } from "../../lib/charmToolData.mjs";
import { useToolPersistence } from "../../lib/useToolPersistence";
import { SaveToRoadmap, SourceToolOnboarding } from "../../components/tools/PlannerExperience";
const DEFAULT_CHARMS = ["Infantry", "Cavalry", "Archer"].flatMap((type) =>
  Array.from({ length: 6 }, (_, i) => ({
    id: `${type}-${i + 1}`,
    type,
    number: i + 1,
    current: 9,
    target: 10,
  })),
);
const LEVELS = Array.from({ length: 23 }, (_, i) => i);
const fmt = (n) => Math.round(n).toLocaleString();
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
const migrateToolState = (value) => value;
function costBetween(from, to, COSTS) {
  let g = 0,
    d = 0;
  for (let level = from + 1; level <= to; level++) {
    g += COSTS[level]?.[0] || 0;
    d += COSTS[level]?.[1] || 0;
  }
  return { g, d };
}
function allocationStates(packs, qs, high) {
  let states = new Map([[0, []]]);
  for (let i = 0; i < packs.length; i++) {
    const unit = packs[i].g / 20,
      maxSlots = qs[i] * packs[i].choices,
      next = new Map();
    for (const [sum, used] of states)
      for (let gs = 0; gs <= maxSlots; gs++) {
        const n = sum + gs * unit;
        if (n > high) break;
        if (!next.has(n)) next.set(n, [...used, gs]);
      }
    states = next;
  }
  return states;
}
function allocationFor(packs, qs, low, high) {
  for (const [sum, used] of allocationStates(packs, qs, high))
    if (sum >= low) return { sum, used };
  return null;
}
function planForWeeks(packs, weeks, needG, needD, ownedG, ownedD) {
  const gUnits = Math.ceil(Math.max(0, needG - ownedG) / 20),
    dUnits = Math.ceil(Math.max(0, needD - ownedD) / 22);
  let states = new Map([[0, { cost: 0, qs: [] }]]);
  for (let i = 0; i < packs.length; i++) {
    const p = packs[i],
      limit = p.max * weeks,
      cap = p.choices * (p.g / 20),
      next = new Map();
    for (const [total, s] of states)
      for (let q = 0; q <= limit; q++) {
        const n = total + q * cap,
          c = s.cost + q * p.price,
          old = next.get(n);
        if (!old || c < old.cost - 0.0001)
          next.set(n, { cost: c, qs: [...s.qs, q] });
      }
    states = next;
  }
  const candidates = [...states]
    .filter(([cap]) => cap >= gUnits + dUnits)
    .sort((a, b) => a[1].cost - b[1].cost || a[0] - b[0]);
  for (const [cap, s] of candidates) {
    const alloc = allocationFor(packs, s.qs, gUnits, cap - dUnits);
    if (!alloc) continue;
    const picks = s.qs.map((q, i) => {
      const gs = alloc.used[i],
        slots = q * packs[i].choices;
      return {
        index: i,
        q,
        gs,
        ds: slots - gs,
        g: gs * packs[i].g,
        d: (slots - gs) * packs[i].d,
        cost: q * packs[i].price,
      };
    });
    return {
      weeks,
      cost: s.cost,
      g: ownedG + picks.reduce((a, p) => a + p.g, 0),
      d: ownedD + picks.reduce((a, p) => a + p.d, 0),
      picks,
    };
  }
  return null;
}
function scheduleFor(plan, packs) {
  const weeks = Array.from({ length: plan.weeks }, () => []);
  for (const pick of plan.picks.filter((p) => p.q)) {
    let q = pick.q,
      gSlots = pick.gs;
    for (let w = 0; w < weeks.length && q; w++) {
      const buys = Math.min(packs[pick.index].max, q),
        slots = buys * packs[pick.index].choices,
        gs = Math.min(slots, gSlots);
      weeks[w].push({
        ...pick,
        q: buys,
        gs,
        ds: slots - gs,
        g: gs * packs[pick.index].g,
        d: (slots - gs) * packs[pick.index].d,
        cost: buys * packs[pick.index].price,
      });
      q -= buys;
      gSlots -= gs;
    }
  }
  return weeks;
}
function charmsFromProfile(value) {
  const selections = parseCharmSelections(value);
  return DEFAULT_CHARMS.map((charm) => {
    const level = Number.parseInt(
      String(
        selections[`${charm.type.toLowerCase()}_${charm.number}`] || "",
      ).replace(/\D/g, ""),
      10,
    );
    return Number.isFinite(level)
      ? {
          ...charm,
          current: Math.min(22, Math.max(0, level)),
          target: Math.max(10, Math.min(22, level)),
        }
      : { ...charm };
  });
}
function validSavedCharms(value) {
  return (
    Array.isArray(value) &&
    value.length === 18 &&
    value.every(
      (item) =>
        item &&
        typeof item.id === "string" &&
        Number.isFinite(item.current) &&
        Number.isFinite(item.target),
    )
  );
}
function validSavedPacks(value) {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every(
      (item) =>
        item &&
        Number.isFinite(item.price) &&
        Number.isFinite(item.g) &&
        Number.isFinite(item.d) &&
        Number.isFinite(item.choices) &&
        Number.isFinite(item.max),
    )
  );
}

export default function CharmPackOptimizer({ configuration }) {
  const COSTS = configuration?.costs || CHARM_COSTS,
    DEFAULT_PACKS = configuration?.packs || CHARM_PACKS;
  const [charms, setCharms] = useState(DEFAULT_CHARMS),
    [packs, setPacks] = useState(DEFAULT_PACKS),
    [ownedG, setOwnedG] = useState(0),
    [ownedD, setOwnedD] = useState(166),
    [maxWeeks, setMaxWeeks] = useState(52),
    [planningMode, setPlanningMode] = useState("targets"),
    [troopWeights, setTroopWeights] = useState({
      Infantry: 3,
      Cavalry: 2,
      Archer: 2,
    }),
    [statWeights, setStatWeights] = useState({ Health: 1, Lethality: 1 }),
    [charmFocus, setCharmFocus] = useState({}),
    [profiles, setProfiles] = useState([]),
    [profileName, setProfileName] = useState(""),
    [plan, setPlan] = useState(null),
    [message, setMessage] = useState(""),
    [syncStatus, setSyncStatus] = useState("");
  const [collapsed, setCollapsed] = useState(new Set()),
    [setCurrent, setSetCurrent] = useState(9),
    [setTarget, setSetTarget] = useState(10);
  const rows = useMemo(
    () =>
      charms.map((charm) => ({
        ...charm,
        ...costBetween(charm.current, charm.target, COSTS),
      })),
    [charms, COSTS],
  );
  const required = useMemo(
    () =>
      rows.reduce((a, row) => ({ g: a.g + row.g, d: a.d + row.d }), {
        g: 0,
        d: 0,
      }),
    [rows],
  );
  const affordable = useMemo(() => {
    let guides = ownedG,
      designs = ownedD;
    const upgrades = [];
    const candidates = charms
      .flatMap((charm) =>
        Array.from(
          { length: Math.max(0, charm.target - charm.current) },
          (_, offset) => {
            const level = charm.current + offset + 1,
              cost = COSTS[level] || [0, 0];
            const focus = charmFocus[charm.id];
            return {
              ...charm,
              level,
              g: cost[0],
              d: cost[1],
              weight:
                (troopWeights[charm.type] || 0) *
                (focus ? statWeights[focus] || 0 : 1),
            };
          },
        ),
      )
      .sort(
        (a, b) =>
          b.weight - a.weight ||
          a.g + a.d - (b.g + b.d) ||
          a.id.localeCompare(b.id) ||
          a.level - b.level,
      );
    const achieved = {};
    let moved = true;
    while (moved) {
      moved = false;
      for (let index = 0; index < candidates.length; index++) {
        const item = candidates[index],
          expected = (achieved[item.id] ?? item.current) + 1;
        if (item.level !== expected || item.g > guides || item.d > designs)
          continue;
        guides -= item.g;
        designs -= item.d;
        achieved[item.id] = item.level;
        upgrades.push(item);
        candidates.splice(index, 1);
        moved = true;
        break;
      }
    }
    return { upgrades, guides, designs };
  }, [COSTS, charmFocus, charms, ownedD, ownedG, statWeights, troopWeights]);
  const bottleneck =
    Math.max(0, required.g - ownedG) >= Math.max(0, required.d - ownedD)
      ? "Charm Guides"
      : "Charm Designs";
  const nearMisses = useMemo(
    () =>
      rows
        .filter((row) => row.target > row.current)
        .map((row) => {
          const next = COSTS[row.current + 1] || [0, 0];
          return {
            ...row,
            nextLevel: row.current + 1,
            missingG: Math.max(0, next[0] - ownedG),
            missingD: Math.max(0, next[1] - ownedD),
          };
        })
        .sort((a, b) => a.missingG + a.missingD - (b.missingG + b.missingD))
        .slice(0, 5),
    [COSTS, ownedD, ownedG, rows],
  );
  const setLevel = (id, key, value) => {
    setCharms((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              [key]: key === "current" ? value : Math.max(item.current, value),
              ...(key === "current" && item.target < value
                ? { target: value }
                : {}),
            }
          : item,
      ),
    );
    setPlan(null);
  };
  const editPack = (i, key, value) => {
    setPacks((items) =>
      items.map((p, n) =>
        n === i ? { ...p, [key]: Math.max(0, Number(value) || 0) } : p,
      ),
    );
    setPlan(null);
  };
  const calculate = () => {
    if (
      packs.some((p) => p.g % 20 !== 0 || Math.abs(p.d - p.g * 1.1) > 0.001)
    ) {
      setMessage(
        "Pack materials must retain the 10:11 Guide-to-Design ratio used by these packs.",
      );
      setPlan(null);
      return;
    }
    for (let week = 1; week <= maxWeeks; week++) {
      const found = planForWeeks(
        packs,
        week,
        required.g,
        required.d,
        ownedG,
        ownedD,
      );
      if (found) {
        setPlan(found);
        setMessage("");
        return;
      }
    }
    setPlan(null);
    setMessage(
      `The selected target cannot be completed within ${maxWeeks} week${maxWeeks === 1 ? "" : "s"}.`,
    );
  };
  const reset = () => {
    setCharms(DEFAULT_CHARMS);
    setPacks(DEFAULT_PACKS);
    setOwnedG(0);
    setOwnedD(166);
    setMaxWeeks(52);
    setPlan(null);
    setMessage("");
  };
  const schedule = plan ? scheduleFor(plan, packs) : [];
  const setAll = (key, value) => {
    setCharms((items) =>
      items.map((item) => ({
        ...item,
        [key]: key === "target" ? Math.max(item.current, value) : value,
        ...(key === "current" && item.target < value ? { target: value } : {}),
      })),
    );
    setPlan(null);
  };
  const copyTroop = (from, to) => {
    const source = charms.filter((item) => item.type === from);
    setCharms((items) =>
      items.map((item) =>
        item.type === to
          ? {
              ...item,
              current: source[item.number - 1].current,
              target: source[item.number - 1].target,
            }
          : item,
      ),
    );
    setPlan(null);
  };
  const toggleTroop = (type) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const syncFromWarLedger = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fetch("/api/member-charm-profile", {
          cache: "no-store",
        }),
        result = await response.json();
      if (!response.ok) {
        if (!silent)
          setSyncStatus(
            response.status === 401
              ? "Sign in as a member to sync your charm levels."
              : "Could not load saved charm levels.",
          );
        return false;
      }
      if (!result.profile?.charms) {
        if (!silent) setSyncStatus("No saved charm levels were found.");
        return false;
      }
      setCharms(charmsFromProfile(result.profile.charms));
      setPlan(null);
      setMessage("");
      if (!silent) setSyncStatus("Saved charm levels synced.");
      return true;
    } catch {
      if (!silent) setSyncStatus("Could not load saved charm levels.");
      return false;
    }
  }, []);

  const restoreInputs = useCallback(
    (saved) => {
      if (validSavedCharms(saved.charms))
        setCharms(
          saved.charms.map((item) => ({
            ...item,
            current: Math.min(22, Math.max(0, item.current)),
            target: Math.min(22, Math.max(item.current, item.target)),
          })),
        );
      if (validSavedPacks(saved.packs))
        setPacks(
          saved.packs.map((pack, index) => ({
            ...pack,
            g: DEFAULT_PACKS[index].g,
            d: DEFAULT_PACKS[index].d,
          })),
        );
      if (Number.isFinite(saved.ownedG)) setOwnedG(Math.max(0, saved.ownedG));
      if (Number.isFinite(saved.ownedD)) setOwnedD(Math.max(0, saved.ownedD));
      if (Number.isFinite(saved.maxWeeks))
        setMaxWeeks(Math.min(52, Math.max(1, saved.maxWeeks)));
      if (saved.planningMode === "resources") setPlanningMode("resources");
      if (saved.troopWeights)
        setTroopWeights((current) => ({ ...current, ...saved.troopWeights }));
      if (saved.statWeights)
        setStatWeights((current) => ({ ...current, ...saved.statWeights }));
      if (saved.charmFocus && typeof saved.charmFocus === "object")
        setCharmFocus(saved.charmFocus);
      if (Array.isArray(saved.profiles))
        setProfiles(saved.profiles.slice(0, 10));
    },
    [DEFAULT_PACKS],
  );
  const inputs = useMemo(
    () => ({
      charms,
      packs,
      ownedG,
      ownedD,
      maxWeeks,
      planningMode,
      troopWeights,
      statWeights,
      charmFocus,
      profiles,
    }),
    [
      charms,
      packs,
      ownedG,
      ownedD,
      maxWeeks,
      planningMode,
      troopWeights,
      statWeights,
      charmFocus,
      profiles,
    ],
  );
  const loadProfile = useCallback(
    () => syncFromWarLedger({ silent: true }),
    [syncFromWarLedger],
  );
  const persistence = useToolPersistence({
    toolKey: "charm-pack-optimizer",
    schemaVersion: 1,
    inputs,
    restore: restoreInputs,
    migrate: migrateToolState,
    onEmpty: loadProfile,
    autoDetect: true,
  });
  const saveStatus = ["dirty", "saving", "error"].includes(persistence.status)
    ? persistence.message
    : syncStatus || persistence.message;
  const exportSchedule = () => {
    if (!plan) return;
    const rows = [
      ["Week", "Pack", "Guide picks", "Design picks", "Cost"],
      ...schedule.flatMap((items, week) =>
        items.map((item) => [
          week + 1,
          money(packs[item.index].price),
          item.gs,
          item.ds,
          item.cost,
        ]),
      ),
    ];
    const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], {
        type: "text/csv",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "charm-upgrade-schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const copySchedule = async () => {
    if (!plan) return;
    await navigator.clipboard.writeText(
      [
        `**Charm Plan — ${money(plan.cost)} / ${plan.weeks} weeks**`,
        ...schedule.flatMap((items, week) =>
          items.length
            ? [
                `Week ${week + 1}: ${items.map((item) => `${money(packs[item.index].price)} (${item.gs}G/${item.ds}D)`).join(", ")}`,
              ]
            : [],
        ),
      ].join("\n"),
    );
  };

  return (
    <section className="cpo-shell">
      <SourceToolOnboarding toolKey="charm-pack-optimizer" current={result ? 4 : 3} />
      <SaveToRoadmap persistence={persistence} />
      <div className="cpo-toolbar">
        <div>
          <span className="k-mark">Charm upgrades</span>
          <strong>18 individual charms</strong>
          <small role="status">{saveStatus}</small>
        </div>
        <div className="cpo-toolbar-actions">
          <button type="button" onClick={() => syncFromWarLedger()}>
            Sync saved levels
          </button>
          <button type="button" onClick={reset}>
            Reset
          </button>
        </div>
      </div>
      <section className="cpo-strategy">
        <div className="cpo-mode">
          <button
            type="button"
            aria-pressed={planningMode === "targets"}
            onClick={() => setPlanningMode("targets")}
          >
            Cost to selected targets
          </button>
          <button
            type="button"
            aria-pressed={planningMode === "resources"}
            onClick={() => setPlanningMode("resources")}
          >
            Optimize available resources
          </button>
        </div>
        <div className="cpo-weights">
          {Object.entries(troopWeights).map(([type, weight]) => (
            <label key={type}>
              {type} priority{" "}
              <input
                type="number"
                min="0"
                max="10"
                value={weight}
                onChange={(event) =>
                  setTroopWeights((current) => ({
                    ...current,
                    [type]: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
            </label>
          ))}
          {Object.entries(statWeights).map(([stat, weight]) => (
            <label key={stat}>
              {stat} priority{" "}
              <input
                type="number"
                min="0"
                max="10"
                value={weight}
                onChange={(event) =>
                  setStatWeights((current) => ({
                    ...current,
                    [stat]: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
            </label>
          ))}
        </div>
        <div className="cpo-profiles">
          <input
            aria-label="Build profile name"
            placeholder="Profile name"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
          />
          <button
            type="button"
            disabled={!profileName.trim()}
            onClick={() => {
              setProfiles((current) =>
                [
                  {
                    name: profileName.trim(),
                    weights: troopWeights,
                    statWeights,
                  },
                  ...current.filter((item) => item.name !== profileName.trim()),
                ].slice(0, 10),
              );
              setProfileName("");
            }}
          >
            Save build profile
          </button>
          {profiles.map((profile) => (
            <button
              type="button"
              key={profile.name}
              onClick={() => {
                setTroopWeights(profile.weights);
                if (profile.statWeights) setStatWeights(profile.statWeights);
              }}
            >
              {profile.name}
            </button>
          ))}
        </div>
        <p>
          Assign Health or Lethality to each charm below to apply both troop and
          stat priorities. Unassigned charms use troop priority only; stat gain
          efficiency remains withheld until a verified gain dataset is supplied.
        </p>
      </section>
      <div className="cpo-layout">
        <div className="cpo-inputs">
          <section className="cpo-section">
            <div className="cpo-section-head">
              <div>
                <span>01</span>
                <h2>Charm levels</h2>
              </div>
              <p>Set every current and target level independently.</p>
            </div>
            <div className="cpo-bulk">
              <label>
                All current{" "}
                <input
                  type="number"
                  min="0"
                  max="22"
                  value={setCurrent}
                  onChange={(event) =>
                    setSetCurrent(Number(event.target.value))
                  }
                />
                <button
                  type="button"
                  onClick={() => setAll("current", setCurrent)}
                >
                  Apply
                </button>
              </label>
              <label>
                All targets{" "}
                <input
                  type="number"
                  min="0"
                  max="22"
                  value={setTarget}
                  onChange={(event) => setSetTarget(Number(event.target.value))}
                />
                <button
                  type="button"
                  onClick={() => setAll("target", setTarget)}
                >
                  Apply
                </button>
              </label>
              <button
                type="button"
                onClick={() => copyTroop("Infantry", "Cavalry")}
              >
                Copy Infantry → Cavalry
              </button>
              <button
                type="button"
                onClick={() => copyTroop("Infantry", "Archer")}
              >
                Copy Infantry → Archer
              </button>
            </div>
            <div className="cpo-troop-toggle" aria-label="Charm troop sections">
              {["Infantry", "Cavalry", "Archer"].map((type) => (
                <button
                  type="button"
                  aria-expanded={!collapsed.has(type)}
                  key={type}
                  onClick={() => toggleTroop(type)}
                >
                  {collapsed.has(type) ? "Show" : "Hide"} {type}
                </button>
              ))}
            </div>
            <div className="cpo-charm-table">
              <div className="cpo-tr cpo-th">
                <span>Type</span>
                <span>Charm</span>
                <span>Current</span>
                <span>Target</span>
                <span>Focus</span>
                <span>Guides</span>
                <span>Designs</span>
              </div>
              {rows
                .filter((row) => !collapsed.has(row.type))
                .map((row, i) => (
                  <div
                    className={`cpo-tr ${row.number === 1 && i > 0 ? "group" : ""}`}
                    key={row.id}
                  >
                    <b>{row.type}</b>
                    <span>#{row.number}</span>
                    <select
                      aria-label={`${row.type} charm ${row.number} current level`}
                      value={row.current}
                      onChange={(e) =>
                        setLevel(row.id, "current", Number(e.target.value))
                      }
                    >
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          Level {level}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${row.type} charm ${row.number} target level`}
                      value={row.target}
                      onChange={(e) =>
                        setLevel(row.id, "target", Number(e.target.value))
                      }
                    >
                      {LEVELS.map((level) => (
                        <option
                          key={level}
                          value={level}
                          disabled={level < row.current}
                        >
                          Level {level}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${row.type} charm ${row.number} stat focus`}
                      value={charmFocus[row.id] || ""}
                      onChange={(event) =>
                        setCharmFocus((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Unassigned</option>
                      <option value="Health">Health</option>
                      <option value="Lethality">Lethality</option>
                    </select>
                    <strong>{fmt(row.g)}</strong>
                    <strong>{fmt(row.d)}</strong>
                  </div>
                ))}
            </div>
            <div className="cpo-totals">
              <div>
                <span>Total Guides required</span>
                <strong>{fmt(required.g)}</strong>
              </div>
              <div>
                <span>Total Designs required</span>
                <strong>{fmt(required.d)}</strong>
              </div>
            </div>
          </section>
          <section className="cpo-section">
            <div className="cpo-section-head">
              <div>
                <span>02</span>
                <h2>Inventory &amp; horizon</h2>
              </div>
            </div>
            <div className="cpo-fields">
              <label>
                <span>Current Guides</span>
                <input
                  type="number"
                  min="0"
                  value={ownedG}
                  onChange={(e) => {
                    setOwnedG(Math.max(0, Number(e.target.value) || 0));
                    setPlan(null);
                  }}
                />
              </label>
              <label>
                <span>Current Designs</span>
                <input
                  type="number"
                  min="0"
                  value={ownedD}
                  onChange={(e) => {
                    setOwnedD(Math.max(0, Number(e.target.value) || 0));
                    setPlan(null);
                  }}
                />
              </label>
              <label>
                <span>Maximum weeks</span>
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={maxWeeks}
                  onChange={(e) => {
                    setMaxWeeks(
                      Math.min(52, Math.max(1, Number(e.target.value) || 1)),
                    );
                    setPlan(null);
                  }}
                />
              </label>
            </div>
          </section>
          <section className="cpo-section">
            <div className="cpo-section-head">
              <div>
                <span>03</span>
                <h2>Weekly packs</h2>
              </div>
              <p>Each choice may be Guides or Designs.</p>
            </div>
            <div className="cpo-pack-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Price</th>
                    <th>Guides</th>
                    <th>Designs</th>
                    <th>Choices</th>
                    <th>Max / week</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.map((pack, i) => (
                    <tr key={i}>
                      {["price", "g", "d", "choices", "max"].map((key) => (
                        <td key={key}>
                          <input
                            aria-label={`${money(pack.price)} pack ${key}`}
                            type="number"
                            min="0"
                            step={key === "price" ? ".01" : "1"}
                            value={pack[key]}
                            onChange={(e) => editPack(i, key, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <button className="cpo-calculate" type="button" onClick={calculate}>
            Calculate weekly purchase plan
          </button>
        </div>
        <aside className="cpo-results">
          <div className="cpo-results-title">
            <span className="k-mark">Calculated result</span>
            <h2>Purchase plan</h2>
          </div>
          <div className="cpo-bottleneck">
            <b>Current bottleneck: {bottleneck}</b>
            <span>
              Based on the larger remaining material shortfall. Priorities
              affect resource-allocation order.
            </span>
          </div>
          {planningMode === "resources" && (
            <div className="cpo-resource-plan">
              <h3>Affordable upgrade path</h3>
              <p>
                {affordable.upgrades.length} level upgrade
                {affordable.upgrades.length === 1 ? "" : "s"} fit your current
                inventory · {fmt(affordable.guides)} Guides and{" "}
                {fmt(affordable.designs)} Designs remain.
              </p>
              {affordable.upgrades.map((item) => (
                <div key={`${item.id}-${item.level}`}>
                  <span>
                    {item.type} #{item.number}
                  </span>
                  <b>Level {item.level}</b>
                </div>
              ))}
              {!affordable.upgrades.length && (
                <p>
                  No selected next-level upgrade fits both material balances.
                </p>
              )}
              <h3>Near-miss upgrades</h3>
              {nearMisses.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.type} #{item.number} → {item.nextLevel}
                  </span>
                  <b>
                    Need {fmt(item.missingG)}G / {fmt(item.missingD)}D
                  </b>
                </div>
              ))}
            </div>
          )}
          {message ? <div className="cpo-alert bad">{message}</div> : null}
          {!plan && !message ? (
            <div className="cpo-empty">
              Set your charm levels and calculate the weekly pack plan.
            </div>
          ) : null}
          {plan ? (
            <>
              <div className="cpo-alert good">
                Target achievable in {plan.weeks} week
                {plan.weeks === 1 ? "" : "s"}
              </div>
              <div className="cpo-summary">
                <div>
                  <span>Total cost</span>
                  <strong>{money(plan.cost)}</strong>
                </div>
                <div>
                  <span>Completion</span>
                  <strong>{plan.weeks} weeks</strong>
                </div>
                <div>
                  <span>Guides after purchase</span>
                  <strong>{fmt(plan.g)}</strong>
                </div>
                <div>
                  <span>Designs after purchase</span>
                  <strong>{fmt(plan.d)}</strong>
                </div>
              </div>
              <h3>Week-by-week plan</h3>
              <div className="cpo-week-list">
                {schedule.map((items, w) =>
                  items.length ? (
                    <div className="cpo-week" key={w}>
                      <div>
                        <b>Week {w + 1}</b>
                        <strong>
                          {money(items.reduce((a, p) => a + p.cost, 0))}
                        </strong>
                      </div>
                      <ul>
                        {items.map((item) => (
                          <li key={item.index}>
                            <span>{money(packs[item.index].price)} pack</span>
                            <b>
                              {item.gs} Guide / {item.ds} Design choices
                            </b>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </div>
              <div className="cpo-export">
                <button type="button" onClick={exportSchedule}>
                  Download CSV
                </button>
                <button type="button" onClick={copySchedule}>
                  Copy for Discord
                </button>
              </div>
            </>
          ) : null}
        </aside>
      </div>
      <style jsx>{`
        .cpo-shell {
          border: 1px solid rgba(201, 164, 78, 0.28);
          background: linear-gradient(
            180deg,
            rgba(13, 25, 34, 0.98),
            rgba(7, 15, 22, 0.98)
          );
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
        }
        .cpo-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(201, 164, 78, 0.2);
          background: rgba(0, 0, 0, 0.16);
        }
        .cpo-toolbar strong {
          display: block;
          color: var(--parchment);
          margin-top: 4px;
        }
        .cpo-toolbar small {
          display: block;
          color: #8ba0aa;
          margin-top: 4px;
          font-size: 10px;
        }
        .cpo-toolbar-actions {
          display: flex;
          gap: 8px;
        }
        .cpo-toolbar button {
          border: 1px solid rgba(201, 164, 78, 0.35);
          background: transparent;
          color: var(--brass);
          padding: 8px 14px;
          cursor: pointer;
        }
        .cpo-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(350px, 0.8fr);
        }
        .cpo-inputs {
          padding: 20px;
          border-right: 1px solid rgba(201, 164, 78, 0.2);
        }
        .cpo-section + .cpo-section {
          margin-top: 28px;
        }
        .cpo-section-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 12px;
        }
        .cpo-section-head > div {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cpo-section-head > div > span {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--brass);
        }
        .cpo-section-head h2,
        .cpo-results h2 {
          font: 600 22px/1 var(--font-display);
          letter-spacing: 0.05em;
          margin: 0;
          color: var(--parchment);
        }
        .cpo-section-head p {
          margin: 0;
          color: var(--t-muted);
          font-size: 11px;
        }
        .cpo-charm-table {
          border: 1px solid #29404b;
        }
        .cpo-tr {
          display: grid;
          grid-template-columns: 1.1fr 0.55fr 1fr 1fr 1fr 0.75fr 0.8fr;
          align-items: center;
        }
        .cpo-tr > * {
          padding: 7px 9px;
          border-right: 1px solid #29404b;
          border-bottom: 1px solid #29404b;
          min-width: 0;
        }
        .cpo-tr > *:last-child {
          border-right: 0;
        }
        .cpo-tr:last-child > * {
          border-bottom: 0;
        }
        .cpo-tr.group > * {
          border-top: 2px solid rgba(201, 164, 78, 0.55);
        }
        .cpo-th {
          background: #0a1720;
          color: #8fa7b2;
          text-transform: uppercase;
          font-size: 9px;
          letter-spacing: 0.08em;
        }
        .cpo-tr b {
          color: var(--brass);
          font-size: 11px;
        }
        .cpo-tr > span {
          font-size: 11px;
          color: #c7d2d6;
        }
        .cpo-tr select,
        .cpo-fields input,
        .cpo-pack-wrap input {
          width: 100%;
          border: 1px solid #35515e;
          background: #07151d;
          color: #eaf2f4;
          border-radius: 4px;
          padding: 7px;
          font: 600 11px var(--font-body);
        }
        .cpo-totals {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        .cpo-totals > div {
          padding: 12px;
          border: 1px solid rgba(201, 164, 78, 0.3);
          background: rgba(201, 164, 78, 0.05);
        }
        .cpo-totals span,
        .cpo-summary span {
          display: block;
          color: #8da1aa;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .cpo-totals strong {
          display: block;
          color: var(--gold-hot);
          font-size: 22px;
          margin-top: 3px;
        }
        .cpo-fields {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .cpo-fields label > span {
          display: block;
          color: #9bacb4;
          font-size: 10px;
          margin-bottom: 5px;
        }
        .cpo-pack-wrap {
          overflow: auto;
          border: 1px solid #29404b;
        }
        .cpo-pack-wrap table {
          width: 100%;
          border-collapse: collapse;
          min-width: 570px;
        }
        .cpo-pack-wrap th,
        .cpo-pack-wrap td {
          padding: 7px;
          border-right: 1px solid #29404b;
          border-bottom: 1px solid #29404b;
        }
        .cpo-pack-wrap th {
          color: #8fa7b2;
          font-size: 9px;
          text-transform: uppercase;
          background: #0a1720;
        }
        .cpo-pack-wrap tr:last-child td {
          border-bottom: 0;
        }
        .cpo-calculate {
          width: 100%;
          margin-top: 18px;
          border: 1px solid #e7bd61;
          background: linear-gradient(135deg, #d6a543, #f0ce79);
          color: #171109;
          font-weight: 900;
          padding: 13px;
          cursor: pointer;
        }
        .cpo-results {
          padding: 20px;
          align-self: start;
          position: sticky;
          top: 16px;
        }
        .cpo-results-title {
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(201, 164, 78, 0.2);
        }
        .cpo-results-title h2 {
          margin-top: 7px;
        }
        .cpo-empty {
          min-height: 280px;
          display: grid;
          place-items: center;
          text-align: center;
          color: #758d98;
          border: 1px dashed #29404b;
          margin-top: 16px;
          padding: 20px;
        }
        .cpo-alert {
          padding: 11px 12px;
          margin: 14px 0;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 800;
        }
        .cpo-alert.good {
          color: #aaf3cf;
          background: rgba(90, 220, 156, 0.08);
          border: 1px solid rgba(90, 220, 156, 0.25);
        }
        .cpo-alert.bad {
          color: #ffc4b5;
          background: rgba(255, 130, 100, 0.08);
          border: 1px solid rgba(255, 130, 100, 0.24);
        }
        .cpo-summary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .cpo-summary > div {
          border: 1px solid #29404b;
          background: #07151d;
          padding: 11px;
        }
        .cpo-summary strong {
          display: block;
          color: var(--parchment);
          margin-top: 4px;
          font-size: 18px;
        }
        .cpo-results h3 {
          color: var(--brass);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 20px 0 8px;
        }
        .cpo-week-list {
          display: grid;
          gap: 7px;
          max-height: 600px;
          overflow: auto;
        }
        .cpo-week {
          border: 1px solid #29404b;
          background: #07151d;
        }
        .cpo-week > div {
          display: flex;
          justify-content: space-between;
          padding: 9px 10px;
          border-bottom: 1px solid #29404b;
        }
        .cpo-week > div b {
          color: var(--brass);
        }
        .cpo-week > div strong {
          color: var(--parchment);
        }
        .cpo-week ul {
          list-style: none;
          margin: 0;
          padding: 4px 10px;
        }
        .cpo-week li {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 0;
          color: #93a7af;
          font-size: 10px;
          border-bottom: 1px solid rgba(41, 64, 75, 0.55);
        }
        .cpo-week li:last-child {
          border: 0;
        }
        .cpo-week li b {
          color: #c6d2d6;
          text-align: right;
        }
        .cpo-bulk,
        .cpo-troop-toggle {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 10px;
        }
        .cpo-bulk label {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--parchment-dim);
          font-size: 10px;
        }
        .cpo-bulk input {
          width: 56px;
          padding: 6px;
          background: #07151d;
          border: 1px solid #35515e;
          color: var(--parchment);
        }
        .cpo-bulk button,
        .cpo-troop-toggle button {
          border: 1px solid var(--edge-strong);
          background: rgba(255, 255, 255, 0.025);
          color: var(--brass-bright);
          padding: 6px 8px;
          font-size: 10px;
          cursor: pointer;
        }
        .cpo-troop-toggle button[aria-expanded="false"] {
          color: var(--t-secondary);
          border-style: dashed;
        }
        @media (max-width: 1050px) {
          .cpo-layout {
            grid-template-columns: 1fr;
          }
          .cpo-inputs {
            border-right: 0;
            border-bottom: 1px solid rgba(201, 164, 78, 0.2);
          }
          .cpo-results {
            position: static;
          }
        }
        @media (max-width: 700px) {
          .cpo-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }
          .cpo-toolbar-actions {
            width: 100%;
          }
          .cpo-toolbar-actions button {
            flex: 1;
          }
          .cpo-inputs,
          .cpo-results {
            padding: 13px;
          }
          .cpo-section-head {
            align-items: flex-start;
            flex-direction: column;
            gap: 6px;
          }
          .cpo-tr {
            grid-template-columns: 1fr 0.55fr 1fr 1fr 1fr;
          }
          .cpo-tr > *:nth-child(6),
          .cpo-tr > *:nth-child(7) {
            display: none;
          }
          .cpo-fields {
            grid-template-columns: 1fr;
          }
          .cpo-summary {
            grid-template-columns: 1fr 1fr;
          }
          .cpo-week li {
            flex-direction: column;
          }
          .cpo-week li b {
            text-align: left;
          }
        }
        .cpo-strategy {
          margin: 0 0 16px;
          padding: 14px;
          border: 1px solid var(--edge-strong);
          border-radius: var(--radius-md);
          background: rgba(9, 10, 18, 0.86);
        }
        .cpo-mode,
        .cpo-weights,
        .cpo-profiles,
        .cpo-export {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .cpo-mode button[aria-pressed="true"] {
          background: var(--gold-aged);
          color: #171108;
        }
        .cpo-strategy button,
        .cpo-profiles input,
        .cpo-weights input,
        .cpo-export button {
          border: 1px solid var(--edge-strong);
          border-radius: 6px;
          background: #11141e;
          color: var(--parchment);
          padding: 7px 9px;
        }
        .cpo-weights {
          margin-top: 10px;
        }
        .cpo-weights label {
          color: var(--parchment-dim);
          font-size: 10px;
        }
        .cpo-weights input {
          width: 55px;
        }
        .cpo-profiles {
          margin-top: 10px;
        }
        .cpo-strategy p,
        .cpo-bottleneck span {
          color: var(--t-secondary);
          font-size: 10px;
        }
        .cpo-bottleneck {
          display: grid;
          gap: 4px;
          margin-bottom: 12px;
          padding: 10px;
          border: 1px solid var(--edge);
        }
        .cpo-resource-plan > div {
          display: flex;
          justify-content: space-between;
          padding: 7px;
          border-bottom: 1px solid var(--edge);
          font-size: 11px;
        }
        .cpo-resource-plan b {
          color: var(--brass-bright);
        }
        .cpo-export {
          margin-top: 12px;
        }
      `}</style>
    </section>
  );
}
