"use client";

import { useCallback, useMemo, useState } from "react";
import {
  PACKS as DEFAULT_PACKS,
  SHOP_ITEMS as DEFAULT_ITEMS,
  VALUE_REFERENCE,
  VALUE_TIERS,
  optimizeEssencePacks,
} from "../../lib/flamedragonShop.mjs";
import { useToolPersistence } from "../../lib/useToolPersistence";
import { SaveToRoadmap, SourceToolOnboarding } from "../../components/tools/PlannerExperience";
import {
  allocateShopCurrency,
  maximizeCurrencyUnderBudget,
} from "../../lib/shopAllocation.mjs";

const EMPTY_CART = Object.fromEntries(
  DEFAULT_ITEMS.map((item) => [item.key, 0]),
);
const DEFAULT_LIMITS = Object.fromEntries(
  DEFAULT_PACKS.map((pack) => [pack.key, pack.defaultMax]),
);
const DEFAULT_PRIORITIES = Object.fromEntries(
  DEFAULT_ITEMS.map((item) => [
    item.key,
    { IB: 5, C: 3, A: 1, U: 2 }[item.tier],
  ]),
);
const migrateToolState = (value) => value;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Math.floor(Number(value) || 0)));
}

function number(value) {
  return Number(value || 0).toLocaleString();
}

function money(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function FlamedragonShopOptimizer({ configuration }) {
  const PACKS = configuration?.packs || DEFAULT_PACKS;
  const SHOP_ITEMS = configuration?.items || DEFAULT_ITEMS;
  const [cart, setCart] = useState(EMPTY_CART);
  const [ownedEssence, setOwnedEssence] = useState(0);
  const [daysRemaining, setDaysRemaining] = useState(1);
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [mode, setMode] = useState("cart");
  const [cashBudget, setCashBudget] = useState(0);
  const [priorities, setPriorities] = useState(DEFAULT_PRIORITIES);
  const [excluded, setExcluded] = useState({});
  const [mustBuy, setMustBuy] = useState({});
  const [minimums, setMinimums] = useState({});
  const restore = useCallback((saved) => {
    if (saved.cart) setCart({ ...EMPTY_CART, ...saved.cart });
    if (Number.isFinite(saved.ownedEssence))
      setOwnedEssence(saved.ownedEssence);
    if (Number.isFinite(saved.daysRemaining))
      setDaysRemaining(saved.daysRemaining);
    if (saved.limits) setLimits({ ...DEFAULT_LIMITS, ...saved.limits });
    if (saved.mode === "allocate") setMode("allocate");
    if (Number.isFinite(saved.cashBudget)) setCashBudget(saved.cashBudget);
    if (saved.priorities)
      setPriorities({ ...DEFAULT_PRIORITIES, ...saved.priorities });
    if (saved.excluded) setExcluded(saved.excluded);
    if (saved.mustBuy) setMustBuy(saved.mustBuy);
    if (saved.minimums) setMinimums(saved.minimums);
  }, []);
  const inputs = useMemo(
    () => ({
      cart,
      ownedEssence,
      daysRemaining,
      limits,
      mode,
      cashBudget,
      priorities,
      excluded,
      mustBuy,
      minimums,
    }),
    [
      cart,
      ownedEssence,
      daysRemaining,
      limits,
      mode,
      cashBudget,
      priorities,
      excluded,
      mustBuy,
      minimums,
    ],
  );
  const persistence = useToolPersistence({
    toolKey: "flamedragon-shop",
    schemaVersion: 1,
    inputs,
    restore,
    migrate: migrateToolState,
    autoDetect: true,
  });
  const saveStatus = persistence.message;

  const effectiveLimits = useMemo(
    () => ({ ...limits, "daily-300": clamp(daysRemaining, 0, 60) }),
    [daysRemaining, limits],
  );
  const totalEssence = useMemo(
    () =>
      SHOP_ITEMS.reduce(
        (sum, item) => sum + item.essence * clamp(cart[item.key], 0, item.max),
        0,
      ),
    [cart, SHOP_ITEMS],
  );
  const essenceToBuy = Math.max(0, totalEssence - ownedEssence);
  const plan = useMemo(
    () => optimizeEssencePacks(essenceToBuy, effectiveLimits, PACKS),
    [effectiveLimits, essenceToBuy, PACKS],
  );
  const selectedItems = useMemo(
    () => SHOP_ITEMS.filter((item) => cart[item.key] > 0),
    [cart, SHOP_ITEMS],
  );
  const availableEssence = PACKS.reduce(
    (sum, pack) => sum + pack.essence * effectiveLimits[pack.key],
    0,
  );
  const budgetPacks = useMemo(
    () => maximizeCurrencyUnderBudget(cashBudget, effectiveLimits, PACKS),
    [cashBudget, effectiveLimits, PACKS],
  );
  const allocation = useMemo(
    () =>
      allocateShopCurrency({
        items: SHOP_ITEMS,
        currency: ownedEssence + budgetPacks.currency,
        priorities,
        excluded,
        mustBuy,
        minimums,
      }),
    [
      SHOP_ITEMS,
      budgetPacks.currency,
      excluded,
      minimums,
      mustBuy,
      ownedEssence,
      priorities,
    ],
  );
  const shownCart =
    mode === "allocate" && allocation.feasible ? allocation.quantities : cart;

  function updateCart(item, value) {
    setCart((current) => ({
      ...current,
      [item.key]: clamp(value, 0, item.max),
    }));
  }

  function applyPreset(tiers) {
    const allowed = new Set(tiers);
    setCart(
      Object.fromEntries(
        SHOP_ITEMS.map((item) => [
          item.key,
          allowed.has(item.tier) ? item.max : 0,
        ]),
      ),
    );
  }

  function updateLimit(pack, value) {
    if (pack.daily) {
      setDaysRemaining(clamp(value, 0, 60));
      return;
    }
    setLimits((current) => ({ ...current, [pack.key]: clamp(value, 0, 20) }));
  }
  const copyPlan = async () => {
    const rewards = SHOP_ITEMS.filter((item) => shownCart[item.key] > 0).map(
        (item) =>
          `• ${item.name}: ${shownCart[item.key]} set${shownCart[item.key] === 1 ? "" : "s"}`,
      ),
      packs =
        mode === "cart" && plan
          ? PACKS.filter((pack) => plan.quantities[pack.key] > 0).map(
              (pack) => `• ${pack.name}: ${plan.quantities[pack.key]}`,
            )
          : [];
    await navigator.clipboard.writeText(
      [
        "**Dragon’s Caravan Plan**",
        ...rewards,
        ...(packs.length ? ["", "**Cash packs**", ...packs] : []),
        `Leftover Essence: ${mode === "cart" ? (plan?.overage ?? 0) : (allocation.leftover ?? 0)}`,
      ].join("\n"),
    );
  };

  return (
    <section className="ft-optimizer">
      <SourceToolOnboarding toolKey="dragons-caravan" current={result ? 4 : 3} />
      <SaveToRoadmap persistence={persistence} />
      <header className="ft-summary-head">
        <div>
          <h2>Dragon’s Caravan Purchase Planner</h2>
          <p>
            Select shop purchases by set. The pack engine minimizes cash cost
            first, then unused Essence, then pack count.
          </p>
        </div>
        <span className="ft-save" role="status">
          {saveStatus}
        </span>
      </header>

      <div className="ft-mode-tabs" role="tablist" aria-label="Planning mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cart"}
          onClick={() => setMode("cart")}
        >
          I know what I want
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "allocate"}
          onClick={() => setMode("allocate")}
        >
          I have Essence / a budget
        </button>
      </div>

      <label className="ft-inventory-field">
        <span>
          <b>Current Dragon Essence in Inventory</b>
          <small>
            Owned Essence is deducted before the calculator recommends any
            packs.
          </small>
        </span>
        <input
          aria-label="Current Dragon Essence in Inventory"
          type="number"
          min="0"
          value={ownedEssence}
          onChange={(event) =>
            setOwnedEssence(
              Math.max(0, Math.floor(Number(event.target.value) || 0)),
            )
          }
        />
      </label>

      {mode === "allocate" && (
        <label className="ft-inventory-field">
          <span>
            <b>Cash budget</b>
            <small>
              Finds the most Essence available within this cap, then applies
              your editable priorities.
            </small>
          </span>
          <input
            aria-label="Cash budget"
            type="number"
            min="0"
            step="0.01"
            value={(cashBudget / 100).toFixed(2)}
            onChange={(event) =>
              setCashBudget(
                Math.max(0, Math.round(Number(event.target.value || 0) * 100)),
              )
            }
          />
        </label>
      )}

      {mode === "cart" && (
        <div className="ft-preset-bar" aria-label="Reward cart presets">
          <button type="button" onClick={() => applyPreset(["IB"])}>
            Max Instant Buys
          </button>
          <button type="button" onClick={() => applyPreset(["IB", "C"])}>
            Max IB + Consider
          </button>
          <button
            type="button"
            onClick={() => applyPreset(["IB", "C", "A", "U"])}
          >
            Max Everything
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => setCart(EMPTY_CART)}
          >
            Clear Cart
          </button>
        </div>
      )}

      <div className="ft-layout">
        <div className="ft-main">
          <section className="ft-panel">
            <div className="ft-section-title">
              <div>
                <h3>Reward Cart</h3>
                <p>
                  Quantity means the number of shop purchases or sets, not the
                  number of individual reward pieces.
                </p>
              </div>
              <strong>{number(totalEssence)} Essence</strong>
            </div>
            <div
              className="ft-shop-table"
              role="table"
              aria-label="Flamedragon Tyrant shop rewards"
            >
              <div className="ft-shop-row ft-shop-labels" role="row">
                <span>Reward</span>
                <span>Each purchase</span>
                <span>Stock</span>
                <span>{mode === "cart" ? "Buy" : "Priority / rules"}</span>
                <span>Essence</span>
              </div>
              {SHOP_ITEMS.map((item) => {
                const quantity = clamp(shownCart[item.key], 0, item.max);
                const tier = VALUE_TIERS[item.tier];
                return (
                  <div className="ft-shop-row" role="row" key={item.key}>
                    <span className="ft-reward">
                      <b>{item.name}</b>
                      <em className={`tier-${item.tier.toLowerCase()}`}>
                        {tier.label}
                        {item.comparison ? ` · ${item.comparison}%` : ""}
                      </em>
                    </span>
                    <span>
                      {number(item.reward)} {item.unit}
                      <small>{number(item.essence)} Essence</small>
                    </span>
                    <span>{number(item.max)} sets</span>
                    <span>
                      {mode === "cart" ? (
                        <input
                          aria-label={`${item.name} sets to buy`}
                          type="number"
                          min="0"
                          max={item.max}
                          value={quantity}
                          onChange={(event) =>
                            updateCart(item, event.target.value)
                          }
                        />
                      ) : (
                        <span className="ft-rules">
                          <label>
                            Weight{" "}
                            <input
                              aria-label={`${item.name} priority weight`}
                              type="number"
                              min="0"
                              max="100"
                              value={priorities[item.key] ?? 0}
                              onChange={(event) =>
                                setPriorities((current) => ({
                                  ...current,
                                  [item.key]: clamp(event.target.value, 0, 100),
                                }))
                              }
                            />
                          </label>
                          <label>
                            Min{" "}
                            <input
                              aria-label={`${item.name} minimum quantity`}
                              type="number"
                              min="0"
                              max={item.max}
                              value={minimums[item.key] ?? 0}
                              onChange={(event) =>
                                setMinimums((current) => ({
                                  ...current,
                                  [item.key]: clamp(
                                    event.target.value,
                                    0,
                                    item.max,
                                  ),
                                }))
                              }
                            />
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(mustBuy[item.key])}
                              onChange={(event) =>
                                setMustBuy((current) => ({
                                  ...current,
                                  [item.key]: event.target.checked,
                                }))
                              }
                            />{" "}
                            Must
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(excluded[item.key])}
                              onChange={(event) =>
                                setExcluded((current) => ({
                                  ...current,
                                  [item.key]: event.target.checked,
                                }))
                              }
                            />{" "}
                            Exclude
                          </label>
                        </span>
                      )}
                    </span>
                    <span className="ft-line-total">
                      {number(quantity * item.essence)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="ft-panel">
            <div className="ft-section-title">
              <div>
                <h3>Pack Availability</h3>
                <p>
                  Adjust remaining limits. The daily pack limit equals the
                  number of purchase days remaining.
                </p>
              </div>
              <strong>{number(availableEssence)} max Essence</strong>
            </div>
            <div className="ft-pack-grid">
              {PACKS.map((pack) => (
                <label key={pack.key} className="ft-pack-input">
                  <span>{pack.name}</span>
                  <b>
                    {money(pack.cents)} · {number(pack.essence)} Essence
                  </b>
                  <small>
                    {pack.daily
                      ? "Days remaining / one each day"
                      : "Packs remaining"}
                  </small>
                  <input
                    type="number"
                    min="0"
                    max={pack.daily ? 60 : 20}
                    value={effectiveLimits[pack.key]}
                    onChange={(event) => updateLimit(pack, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="ft-side">
          <section className="ft-result-card">
            <h3>
              {mode === "cart" ? "Cheapest Pack Plan" : "Priority Allocation"}
            </h3>
            <div className="ft-result-total">
              <span>{mode === "cart" ? "Total spend" : "Budget used"}</span>
              <strong>
                {mode === "cart"
                  ? plan
                    ? money(plan.costCents)
                    : "Unavailable"
                  : money(budgetPacks.spentCents)}
              </strong>
            </div>
            <div className="ft-metrics">
              <div>
                <span>{mode === "cart" ? "Cart cost" : "Allocated"}</span>
                <b>
                  {number(mode === "cart" ? totalEssence : allocation.spent)}
                </b>
              </div>
              <div>
                <span>Owned</span>
                <b>{number(ownedEssence)}</b>
              </div>
              <div>
                <span>{mode === "cart" ? "Buy" : "Pack Essence"}</span>
                <b>
                  {number(
                    mode === "cart" ? essenceToBuy : budgetPacks.currency,
                  )}
                </b>
              </div>
              <div>
                <span>Left over</span>
                <b>
                  {number(
                    mode === "cart"
                      ? (plan?.overage ?? 0)
                      : (allocation.leftover ?? 0),
                  )}
                </b>
              </div>
            </div>
            {mode === "allocate" ? (
              allocation.feasible ? (
                <div className="ft-plan-list">
                  <p>
                    {number(allocation.spent)} Essence allocated ·{" "}
                    {number(allocation.leftover)} left over.
                  </p>
                  {allocation.selected.map((entry) => {
                    const item = SHOP_ITEMS.find(
                      (candidate) => candidate.key === entry.key,
                    );
                    return (
                      <div key={entry.key}>
                        <span>
                          {item.name}
                          <small>{entry.reason}</small>
                        </span>
                        <b>
                          {entry.quantity} set{entry.quantity === 1 ? "" : "s"}
                        </b>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ft-warning">
                  Must-buy and minimum rules need {number(allocation.shortfall)}{" "}
                  more Essence. Raise the budget or relax a rule.
                </div>
              )
            ) : plan ? (
              <div className="ft-plan-list">
                {PACKS.map((pack) =>
                  plan.quantities[pack.key] > 0 ? (
                    <div key={pack.key}>
                      <span>{pack.name}</span>
                      <b>
                        {plan.quantities[pack.key]} × {money(pack.cents)}
                      </b>
                    </div>
                  ) : null,
                )}
                {plan.count === 0 ? (
                  <p>No packs needed—owned Essence covers this cart.</p>
                ) : null}
              </div>
            ) : (
              <div className="ft-warning">
                The selected cart needs more Essence than the available pack
                limits provide. Reduce rewards or increase remaining pack
                availability.
              </div>
            )}
          </section>

          <section className="ft-panel ft-selected">
            <h3>
              {mode === "cart" ? "Selected Rewards" : "Recommended Rewards"}
            </h3>
            {(mode === "cart"
              ? selectedItems
              : SHOP_ITEMS.filter((item) => shownCart[item.key] > 0)
            ).length ? (
              (mode === "cart"
                ? selectedItems
                : SHOP_ITEMS.filter((item) => shownCart[item.key] > 0)
              ).map((item) => (
                <div key={item.key}>
                  <span>
                    {item.name}
                    <small>
                      {shownCart[item.key]} set
                      {shownCart[item.key] === 1 ? "" : "s"}
                    </small>
                  </span>
                  <b>
                    {number(shownCart[item.key] * item.reward)} {item.unit}
                  </b>
                </div>
              ))
            ) : (
              <p>No rewards fit the current plan.</p>
            )}
          </section>

          <section className="ft-panel ft-value-guide">
            <h3>Value Guide</h3>
            <p>
              Percentage is the Caravan cost versus the closest comparable
              special pack. Lower is better. Ratings are community-reported,
              subjective guidance; allocation uses the editable weights above.
            </p>
            {VALUE_REFERENCE.map((item) => (
              <div key={item.name}>
                <span>
                  <em className={`tier-${item.tier.toLowerCase()}`}>
                    {item.tier}
                  </em>
                  {item.name}
                  {item.unavailable ? (
                    <small>Not in supplied shop stock</small>
                  ) : null}
                </span>
                <b>{item.comparison}%</b>
              </div>
            ))}
          </section>
          <button type="button" className="ft-copy" onClick={copyPlan}>
            Copy plan for Discord
          </button>
        </aside>
      </div>

      <style jsx>{`
        .ft-optimizer {
          --ft-bg: #0a1520;
          --ft-panel: #0c1d29;
          --ft-line: #294351;
          --ft-text: #eff5f3;
          --ft-muted: #8da3ad;
          --ft-fire: #f0a94b;
          border: 1px solid rgba(201, 164, 78, 0.3);
          background: linear-gradient(145deg, #101a24, #071019 70%);
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.32);
        }
        .ft-summary-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 16px;
        }
        .ft-summary-head h2 {
          margin: 0;
          color: var(--ft-text);
          font:
            500 clamp(25px, 4vw, 36px)/1.1 Georgia,
            serif;
        }
        .ft-summary-head p {
          margin: 7px 0 0;
          max-width: 760px;
          color: var(--ft-muted);
          font-size: 13px;
          line-height: 1.55;
        }
        .ft-save {
          flex: 0 0 auto;
          color: #b9c8ce;
          font-size: 11px;
          padding-top: 6px;
        }
        .ft-mode-tabs {
          display: flex;
          gap: 8px;
          margin: 0 0 14px;
        }
        .ft-copy {
          border: 1px solid #8c5a27;
          background: #25170d;
          color: #ffd083;
          border-radius: 8px;
          padding: 10px;
          font-weight: 800;
          cursor: pointer;
        }
        .ft-mode-tabs button {
          padding: 10px 14px;
          border: 1px solid #385564;
          border-radius: 8px;
          background: #081722;
          color: #b9c9d0;
          font-weight: 800;
        }
        .ft-mode-tabs button[aria-selected="true"] {
          border-color: #d68b38;
          background: #9a571f;
          color: #fff;
        }
        .ft-rules {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
        }
        .ft-rules label {
          font-size: 8px;
          color: #8da3ad;
        }
        .ft-rules input[type="number"] {
          padding: 5px;
        }
        .ft-rules input[type="checkbox"] {
          width: auto;
          padding: 0;
        }
        .ft-inventory-field {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 180px;
          align-items: center;
          gap: 18px;
          margin-bottom: 14px;
          padding: 14px 16px;
          border: 1px solid rgba(240, 169, 75, 0.55);
          background: linear-gradient(
            100deg,
            rgba(117, 61, 19, 0.35),
            rgba(10, 28, 40, 0.88)
          );
          border-radius: 11px;
          color: #f4ead8;
        }
        .ft-inventory-field span,
        .ft-inventory-field small {
          display: block;
        }
        .ft-inventory-field b {
          font-size: 13px;
        }
        .ft-inventory-field small {
          margin-top: 4px;
          color: #b9a98f;
          font-size: 10px;
          font-weight: 400;
        }
        .ft-inventory-field input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #a86d2e;
          background: #120d08;
          color: #ffd68d;
          border-radius: 8px;
          padding: 11px;
          font: 800 17px var(--font-mono);
        }
        .ft-inventory-field input:focus {
          outline: 2px solid rgba(255, 195, 108, 0.3);
          border-color: #ffc36c;
        }
        .ft-preset-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }
        .ft-preset-bar button {
          border: 1px solid #9a6128;
          background: linear-gradient(180deg, #c98231, #8d4a1c);
          color: #fff7e8;
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }
        .ft-preset-bar button.quiet {
          background: #0b1b26;
          border-color: #304b5a;
          color: #b9c9d0;
        }
        .ft-preset-bar button:hover {
          filter: brightness(1.1);
        }
        .ft-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(310px, 0.72fr);
          gap: 16px;
        }
        .ft-main,
        .ft-side {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ft-panel,
        .ft-result-card {
          border: 1px solid var(--ft-line);
          background: rgba(10, 28, 40, 0.92);
          border-radius: 13px;
          padding: 16px;
        }
        .ft-panel h3,
        .ft-result-card h3 {
          margin: 0;
          color: #e5ecec;
          font-size: 12px;
          letter-spacing: 0.11em;
          text-transform: uppercase;
        }
        .ft-section-title {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 13px;
        }
        .ft-section-title p,
        .ft-value-guide > p {
          color: var(--ft-muted);
          font-size: 11px;
          line-height: 1.5;
          margin: 5px 0 0;
        }
        .ft-section-title > strong {
          color: #ffc36c;
          font: 700 16px/1.2 var(--font-mono);
          white-space: nowrap;
        }
        .ft-shop-table {
          border-top: 1px solid var(--ft-line);
        }
        .ft-shop-row {
          display: grid;
          grid-template-columns:
            minmax(180px, 1.45fr) minmax(130px, 1fr)
            78px 180px 82px;
          gap: 10px;
          align-items: center;
          min-height: 66px;
          border-bottom: 1px solid rgba(41, 67, 81, 0.72);
          color: #c8d4d7;
          font-size: 12px;
        }
        .ft-shop-labels {
          min-height: 35px;
          color: #718b97;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.09em;
        }
        .ft-shop-row > span:last-child {
          text-align: right;
        }
        .ft-reward b {
          display: block;
          color: #edf4f3;
          font-size: 13px;
        }
        .ft-reward em {
          display: inline-block;
          margin-top: 5px;
          font-style: normal;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .ft-shop-row small {
          display: block;
          margin-top: 4px;
          color: #728d99;
          font-size: 9px;
        }
        .ft-shop-row input,
        .ft-pack-input input,
        .ft-owned input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #385564;
          background: #06131c;
          color: #f1f6f5;
          border-radius: 7px;
          padding: 8px;
          font: 700 12px var(--font-mono);
        }
        .ft-line-total {
          color: #ffcb7a;
          font-weight: 800;
          font-family: var(--font-mono);
        }
        .tier-ib {
          color: #75e5b2;
        }
        .tier-c {
          color: #ffd270;
        }
        .tier-a {
          color: #ff8f7d;
        }
        .tier-u {
          color: #839ca7;
        }
        .ft-pack-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
        }
        .ft-pack-input {
          display: grid;
          grid-template-columns: 1fr 68px;
          gap: 4px 8px;
          align-items: center;
          border: 1px solid #274452;
          background: #081722;
          border-radius: 9px;
          padding: 10px;
          color: #d7e1e2;
          font-size: 11px;
        }
        .ft-pack-input b,
        .ft-pack-input small {
          grid-column: 1;
          color: #8299a3;
          font-size: 9px;
          font-weight: 500;
        }
        .ft-pack-input input {
          grid-column: 2;
          grid-row: 1/4;
        }
        .ft-owned {
          display: grid;
          grid-template-columns: 1fr 120px;
          align-items: center;
          gap: 12px;
          margin-top: 10px;
          color: #b9c9ce;
          font-size: 11px;
        }
        .ft-result-card {
          position: sticky;
          top: 16px;
          border-color: #8c5a27;
          background: linear-gradient(165deg, #25170d, #111a20 58%);
        }
        .ft-result-total {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin: 18px 0;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(240, 169, 75, 0.25);
        }
        .ft-result-total span {
          color: #b9a98f;
          font-size: 11px;
        }
        .ft-result-total strong {
          color: #ffd083;
          font:
            500 34px Georgia,
            serif;
        }
        .ft-metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
        }
        .ft-metrics div {
          background: rgba(5, 16, 23, 0.55);
          border: 1px solid #3b3b32;
          border-radius: 8px;
          padding: 9px;
        }
        .ft-metrics span {
          display: block;
          color: #758d95;
          font-size: 8px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .ft-metrics b {
          display: block;
          color: #eef3f1;
          font-size: 15px;
          margin-top: 3px;
        }
        .ft-plan-list {
          margin-top: 14px;
        }
        .ft-plan-list div,
        .ft-selected div,
        .ft-value-guide div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 0;
          border-bottom: 1px solid rgba(41, 67, 81, 0.65);
          font-size: 11px;
          color: #b9c9ce;
        }
        .ft-plan-list b,
        .ft-selected b,
        .ft-value-guide b {
          color: #ffe0a3;
          text-align: right;
        }
        .ft-plan-list p,
        .ft-selected p {
          color: #79919b;
          font-size: 11px;
        }
        .ft-warning {
          margin-top: 13px;
          padding: 11px;
          border: 1px solid rgba(255, 112, 88, 0.35);
          background: rgba(255, 86, 55, 0.08);
          border-radius: 8px;
          color: #ffc0b2;
          font-size: 11px;
          line-height: 1.5;
        }
        .ft-selected small,
        .ft-value-guide small {
          display: block;
          color: #718994;
          font-size: 9px;
          margin-top: 3px;
        }
        .ft-value-guide > div > span {
          display: grid;
          grid-template-columns: 25px 1fr;
          align-items: center;
        }
        .ft-value-guide em {
          font-style: normal;
          font-size: 9px;
          font-weight: 900;
        }
        .ft-value-guide small {
          grid-column: 2;
        }
        @media (max-width: 1050px) {
          .ft-layout {
            grid-template-columns: 1fr;
          }
          .ft-result-card {
            position: static;
          }
          .ft-pack-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 720px) {
          .ft-optimizer {
            padding: 13px;
          }
          .ft-summary-head {
            flex-direction: column;
          }
          .ft-save {
            padding: 0;
          }
          .ft-inventory-field {
            grid-template-columns: 1fr;
          }
          .ft-shop-table {
            overflow-x: auto;
          }
          .ft-shop-row {
            min-width: 710px;
          }
          .ft-pack-grid {
            grid-template-columns: 1fr;
          }
          .ft-section-title {
            flex-direction: column;
          }
          .ft-result-total strong {
            font-size: 30px;
          }
        }
      `}</style>
    </section>
  );
}
