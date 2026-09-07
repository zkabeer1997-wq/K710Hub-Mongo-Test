'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PACKS as DEFAULT_PACKS, SHOP_ITEMS as DEFAULT_ITEMS, VALUE_REFERENCE, VALUE_TIERS, optimizeEssencePacks } from '../../lib/flamedragonShop.mjs';

const EMPTY_CART = Object.fromEntries(DEFAULT_ITEMS.map((item) => [item.key, 0]));
const DEFAULT_LIMITS = Object.fromEntries(DEFAULT_PACKS.map((pack) => [pack.key, pack.defaultMax]));

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Math.floor(Number(value) || 0)));
}

function number(value) {
  return Number(value || 0).toLocaleString();
}

function money(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function FlamedragonShopOptimizer({ configuration }) {
  const PACKS = configuration?.packs || DEFAULT_PACKS;
  const SHOP_ITEMS = configuration?.items || DEFAULT_ITEMS;
  const [cart, setCart] = useState(EMPTY_CART);
  const [ownedEssence, setOwnedEssence] = useState(0);
  const [daysRemaining, setDaysRemaining] = useState(1);
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading your last entry…');
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/tool-state/flamedragon-shop', { cache: 'no-store' });
        if (!response.ok) {
          setSaveStatus(response.status === 401 ? 'Sign in as a member to restore and save this plan.' : 'Could not load saved inputs.');
          return;
        }
        const result = await response.json();
        const saved = result?.state;
        if (saved && typeof saved === 'object') {
          if (saved.cart && typeof saved.cart === 'object') setCart({ ...EMPTY_CART, ...saved.cart });
          if (Number.isFinite(saved.ownedEssence)) setOwnedEssence(saved.ownedEssence);
          if (Number.isFinite(saved.daysRemaining)) setDaysRemaining(saved.daysRemaining);
          if (saved.limits && typeof saved.limits === 'object') setLimits({ ...DEFAULT_LIMITS, ...saved.limits });
          setSaveStatus('Last saved plan restored.');
        } else {
          setSaveStatus('No saved plan yet. Inputs save automatically.');
        }
      } catch {
        setSaveStatus('Could not load saved inputs.');
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }
    load();
    return () => { cancelled = true; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('Saving…');
    saveTimer.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/tool-state/flamedragon-shop', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: { cart, ownedEssence, daysRemaining, limits } }),
        });
        setSaveStatus(response.ok ? 'Saved to your member profile.' : response.status === 401 ? 'Log in to save this plan.' : 'Save failed.');
      } catch {
        setSaveStatus('Save failed.');
      }
    }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [cart, daysRemaining, hydrated, limits, ownedEssence]);

  const effectiveLimits = useMemo(() => ({ ...limits, 'daily-300': clamp(daysRemaining, 0, 60) }), [daysRemaining, limits]);
  const totalEssence = useMemo(() => SHOP_ITEMS.reduce((sum, item) => sum + item.essence * clamp(cart[item.key], 0, item.max), 0), [cart, SHOP_ITEMS]);
  const essenceToBuy = Math.max(0, totalEssence - ownedEssence);
  const plan = useMemo(() => optimizeEssencePacks(essenceToBuy, effectiveLimits, PACKS), [effectiveLimits, essenceToBuy, PACKS]);
  const selectedItems = useMemo(() => SHOP_ITEMS.filter((item) => cart[item.key] > 0), [cart, SHOP_ITEMS]);
  const availableEssence = PACKS.reduce((sum, pack) => sum + pack.essence * effectiveLimits[pack.key], 0);

  function updateCart(item, value) {
    setCart((current) => ({ ...current, [item.key]: clamp(value, 0, item.max) }));
  }

  function applyPreset(tiers) {
    const allowed = new Set(tiers);
    setCart(Object.fromEntries(SHOP_ITEMS.map((item) => [item.key, allowed.has(item.tier) ? item.max : 0])));
  }

  function updateLimit(pack, value) {
    if (pack.daily) {
      setDaysRemaining(clamp(value, 0, 60));
      return;
    }
    setLimits((current) => ({ ...current, [pack.key]: clamp(value, 0, 20) }));
  }

  return <section className="ft-optimizer">
    <header className="ft-summary-head">
      <div><h2>Dragon’s Caravan Purchase Planner</h2><p>Select shop purchases by set. The pack engine minimizes cash cost first, then unused Essence, then pack count.</p></div>
      <span className="ft-save" role="status">{saveStatus}</span>
    </header>

    <label className="ft-inventory-field">
      <span><b>Current Dragon Essence in Inventory</b><small>Owned Essence is deducted before the calculator recommends any packs.</small></span>
      <input aria-label="Current Dragon Essence in Inventory" type="number" min="0" value={ownedEssence} onChange={(event) => setOwnedEssence(Math.max(0, Math.floor(Number(event.target.value) || 0)))}/>
    </label>

    <div className="ft-preset-bar" aria-label="Reward cart presets">
      <button type="button" onClick={() => applyPreset(['IB'])}>Max Instant Buys</button>
      <button type="button" onClick={() => applyPreset(['IB', 'C'])}>Max IB + Consider</button>
      <button type="button" onClick={() => applyPreset(['IB', 'C', 'A', 'U'])}>Max Everything</button>
      <button type="button" className="quiet" onClick={() => setCart(EMPTY_CART)}>Clear Cart</button>
    </div>

    <div className="ft-layout">
      <div className="ft-main">
        <section className="ft-panel">
          <div className="ft-section-title"><div><h3>Reward Cart</h3><p>Quantity means the number of shop purchases or sets, not the number of individual reward pieces.</p></div><strong>{number(totalEssence)} Essence</strong></div>
          <div className="ft-shop-table" role="table" aria-label="Flamedragon Tyrant shop rewards">
            <div className="ft-shop-row ft-shop-labels" role="row"><span>Reward</span><span>Each purchase</span><span>Stock</span><span>Buy</span><span>Essence</span></div>
            {SHOP_ITEMS.map((item) => {
              const quantity = clamp(cart[item.key], 0, item.max);
              const tier = VALUE_TIERS[item.tier];
              return <div className="ft-shop-row" role="row" key={item.key}>
                <span className="ft-reward"><b>{item.name}</b><em className={`tier-${item.tier.toLowerCase()}`}>{tier.label}{item.comparison ? ` · ${item.comparison}%` : ''}</em></span>
                <span>{number(item.reward)} {item.unit}<small>{number(item.essence)} Essence</small></span>
                <span>{number(item.max)} sets</span>
                <span><input aria-label={`${item.name} sets to buy`} type="number" min="0" max={item.max} value={quantity} onChange={(event) => updateCart(item, event.target.value)}/></span>
                <span className="ft-line-total">{number(quantity * item.essence)}</span>
              </div>;
            })}
          </div>
        </section>

        <section className="ft-panel">
          <div className="ft-section-title"><div><h3>Pack Availability</h3><p>Adjust remaining limits. The daily pack limit equals the number of purchase days remaining.</p></div><strong>{number(availableEssence)} max Essence</strong></div>
          <div className="ft-pack-grid">
            {PACKS.map((pack) => <label key={pack.key} className="ft-pack-input"><span>{pack.name}</span><b>{money(pack.cents)} · {number(pack.essence)} Essence</b><small>{pack.daily ? 'Days remaining / one each day' : 'Packs remaining'}</small><input type="number" min="0" max={pack.daily ? 60 : 20} value={effectiveLimits[pack.key]} onChange={(event) => updateLimit(pack, event.target.value)}/></label>)}
          </div>
        </section>
      </div>

      <aside className="ft-side">
        <section className="ft-result-card">
          <h3>Cheapest Pack Plan</h3>
          <div className="ft-result-total"><span>Total spend</span><strong>{plan ? money(plan.costCents) : 'Unavailable'}</strong></div>
          <div className="ft-metrics"><div><span>Cart cost</span><b>{number(totalEssence)}</b></div><div><span>Owned</span><b>{number(ownedEssence)}</b></div><div><span>Buy</span><b>{number(essenceToBuy)}</b></div><div><span>Left over</span><b>{plan ? number(plan.overage) : '—'}</b></div></div>
          {plan ? <div className="ft-plan-list">{PACKS.map((pack) => plan.quantities[pack.key] > 0 ? <div key={pack.key}><span>{pack.name}</span><b>{plan.quantities[pack.key]} × {money(pack.cents)}</b></div> : null)}{plan.count === 0 ? <p>No packs needed—owned Essence covers this cart.</p> : null}</div> : <div className="ft-warning">The selected cart needs more Essence than the available pack limits provide. Reduce rewards or increase remaining pack availability.</div>}
        </section>

        <section className="ft-panel ft-selected">
          <h3>Selected Rewards</h3>
          {selectedItems.length ? selectedItems.map((item) => <div key={item.key}><span>{item.name}<small>{cart[item.key]} set{cart[item.key] === 1 ? '' : 's'}</small></span><b>{number(cart[item.key] * item.reward)} {item.unit}</b></div>) : <p>Your reward cart is empty.</p>}
        </section>

        <section className="ft-panel ft-value-guide">
          <h3>Value Guide</h3><p>Percentage is the Caravan cost versus the closest comparable special pack. Lower is better.</p>
          {VALUE_REFERENCE.map((item) => <div key={item.name}><span><em className={`tier-${item.tier.toLowerCase()}`}>{item.tier}</em>{item.name}{item.unavailable ? <small>Not in supplied shop stock</small> : null}</span><b>{item.comparison}%</b></div>)}
        </section>
      </aside>
    </div>

    <style jsx>{`
      .ft-optimizer{--ft-bg:#0a1520;--ft-panel:#0c1d29;--ft-line:#294351;--ft-text:#eff5f3;--ft-muted:#8da3ad;--ft-fire:#f0a94b;border:1px solid rgba(201,164,78,.3);background:linear-gradient(145deg,#101a24,#071019 70%);border-radius:18px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.32)}
      .ft-summary-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:16px}.ft-summary-head h2{margin:0;color:var(--ft-text);font:500 clamp(25px,4vw,36px)/1.1 Georgia,serif}.ft-summary-head p{margin:7px 0 0;max-width:760px;color:var(--ft-muted);font-size:13px;line-height:1.55}.ft-save{flex:0 0 auto;color:#b9c8ce;font-size:11px;padding-top:6px}
      .ft-inventory-field{display:grid;grid-template-columns:minmax(0,1fr) 180px;align-items:center;gap:18px;margin-bottom:14px;padding:14px 16px;border:1px solid rgba(240,169,75,.55);background:linear-gradient(100deg,rgba(117,61,19,.35),rgba(10,28,40,.88));border-radius:11px;color:#f4ead8}.ft-inventory-field span,.ft-inventory-field small{display:block}.ft-inventory-field b{font-size:13px}.ft-inventory-field small{margin-top:4px;color:#b9a98f;font-size:10px;font-weight:400}.ft-inventory-field input{width:100%;box-sizing:border-box;border:1px solid #a86d2e;background:#120d08;color:#ffd68d;border-radius:8px;padding:11px;font:800 17px var(--font-mono)}.ft-inventory-field input:focus{outline:2px solid rgba(255,195,108,.3);border-color:#ffc36c}
      .ft-preset-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.ft-preset-bar button{border:1px solid #9a6128;background:linear-gradient(180deg,#c98231,#8d4a1c);color:#fff7e8;border-radius:8px;padding:9px 12px;font-size:11px;font-weight:800;cursor:pointer}.ft-preset-bar button.quiet{background:#0b1b26;border-color:#304b5a;color:#b9c9d0}.ft-preset-bar button:hover{filter:brightness(1.1)}
      .ft-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(310px,.72fr);gap:16px}.ft-main,.ft-side{display:flex;flex-direction:column;gap:16px}.ft-panel,.ft-result-card{border:1px solid var(--ft-line);background:rgba(10,28,40,.92);border-radius:13px;padding:16px}.ft-panel h3,.ft-result-card h3{margin:0;color:#e5ecec;font-size:12px;letter-spacing:.11em;text-transform:uppercase}.ft-section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:13px}.ft-section-title p,.ft-value-guide>p{color:var(--ft-muted);font-size:11px;line-height:1.5;margin:5px 0 0}.ft-section-title>strong{color:#ffc36c;font:700 16px/1.2 var(--font-mono);white-space:nowrap}
      .ft-shop-table{border-top:1px solid var(--ft-line)}.ft-shop-row{display:grid;grid-template-columns:minmax(180px,1.45fr) minmax(130px,1fr) 78px 82px 82px;gap:10px;align-items:center;min-height:66px;border-bottom:1px solid rgba(41,67,81,.72);color:#c8d4d7;font-size:12px}.ft-shop-labels{min-height:35px;color:#718b97;font-size:9px;text-transform:uppercase;letter-spacing:.09em}.ft-shop-row>span:last-child{text-align:right}.ft-reward b{display:block;color:#edf4f3;font-size:13px}.ft-reward em{display:inline-block;margin-top:5px;font-style:normal;font-size:9px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.ft-shop-row small{display:block;margin-top:4px;color:#728d99;font-size:9px}.ft-shop-row input,.ft-pack-input input,.ft-owned input{width:100%;box-sizing:border-box;border:1px solid #385564;background:#06131c;color:#f1f6f5;border-radius:7px;padding:8px;font:700 12px var(--font-mono)}.ft-line-total{color:#ffcb7a;font-weight:800;font-family:var(--font-mono)}
      .tier-ib{color:#75e5b2}.tier-c{color:#ffd270}.tier-a{color:#ff8f7d}.tier-u{color:#839ca7}.ft-pack-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.ft-pack-input{display:grid;grid-template-columns:1fr 68px;gap:4px 8px;align-items:center;border:1px solid #274452;background:#081722;border-radius:9px;padding:10px;color:#d7e1e2;font-size:11px}.ft-pack-input b,.ft-pack-input small{grid-column:1;color:#8299a3;font-size:9px;font-weight:500}.ft-pack-input input{grid-column:2;grid-row:1/4}.ft-owned{display:grid;grid-template-columns:1fr 120px;align-items:center;gap:12px;margin-top:10px;color:#b9c9ce;font-size:11px}
      .ft-result-card{position:sticky;top:16px;border-color:#8c5a27;background:linear-gradient(165deg,#25170d,#111a20 58%)}.ft-result-total{display:flex;align-items:flex-end;justify-content:space-between;margin:18px 0;padding-bottom:14px;border-bottom:1px solid rgba(240,169,75,.25)}.ft-result-total span{color:#b9a98f;font-size:11px}.ft-result-total strong{color:#ffd083;font:500 34px Georgia,serif}.ft-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px}.ft-metrics div{background:rgba(5,16,23,.55);border:1px solid #3b3b32;border-radius:8px;padding:9px}.ft-metrics span{display:block;color:#758d95;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.ft-metrics b{display:block;color:#eef3f1;font-size:15px;margin-top:3px}.ft-plan-list{margin-top:14px}.ft-plan-list div,.ft-selected div,.ft-value-guide div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(41,67,81,.65);font-size:11px;color:#b9c9ce}.ft-plan-list b,.ft-selected b,.ft-value-guide b{color:#ffe0a3;text-align:right}.ft-plan-list p,.ft-selected p{color:#79919b;font-size:11px}.ft-warning{margin-top:13px;padding:11px;border:1px solid rgba(255,112,88,.35);background:rgba(255,86,55,.08);border-radius:8px;color:#ffc0b2;font-size:11px;line-height:1.5}.ft-selected small,.ft-value-guide small{display:block;color:#718994;font-size:9px;margin-top:3px}.ft-value-guide>div>span{display:grid;grid-template-columns:25px 1fr;align-items:center}.ft-value-guide em{font-style:normal;font-size:9px;font-weight:900}.ft-value-guide small{grid-column:2}
      @media(max-width:1050px){.ft-layout{grid-template-columns:1fr}.ft-result-card{position:static}.ft-pack-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.ft-optimizer{padding:13px}.ft-summary-head{flex-direction:column}.ft-save{padding:0}.ft-inventory-field{grid-template-columns:1fr}.ft-shop-table{overflow-x:auto}.ft-shop-row{min-width:710px}.ft-pack-grid{grid-template-columns:1fr}.ft-section-title{flex-direction:column}.ft-result-total strong{font-size:30px}}
    `}</style>
  </section>;
}
