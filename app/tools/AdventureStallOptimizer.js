'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PACKS as DEFAULT_PACKS, SHOP_ITEMS as DEFAULT_ITEMS, optimizeShellPacks, packLimits } from '../../lib/adventureStall.mjs';

const EMPTY_CART = Object.fromEntries(DEFAULT_ITEMS.map((item) => [item.key, 0]));
const LIMITED_KEYS = new Set(['true-gold-limited', 'hero-shards', 'forgehammers-limited', 'mithril', 'mythic-hero-gear']);

function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, Math.floor(Number(value) || 0))); }
function number(value) { return Number(value || 0).toLocaleString(); }
function money(cents) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100); }

export default function AdventureStallOptimizer({ configuration }) {
  const PACKS = configuration?.packs || DEFAULT_PACKS;
  const SHOP_ITEMS = configuration?.items || DEFAULT_ITEMS;
  const [cart, setCart] = useState(EMPTY_CART);
  const [ownedShells, setOwnedShells] = useState(0);
  const [daysRemaining, setDaysRemaining] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading your last entry…');
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch('/api/tool-state/adventure-stall', { cache: 'no-store' });
        if (!response.ok) { setSaveStatus(response.status === 401 ? 'Sign in as a member to restore and save this plan.' : 'Could not load saved inputs.'); return; }
        const result = await response.json();
        const saved = result?.state;
        if (saved && typeof saved === 'object') {
          if (saved.cart && typeof saved.cart === 'object') setCart({ ...EMPTY_CART, ...saved.cart });
          if (Number.isFinite(saved.ownedShells)) setOwnedShells(saved.ownedShells);
          if (Number.isFinite(saved.daysRemaining)) setDaysRemaining(saved.daysRemaining);
          setSaveStatus('Last saved plan restored.');
        } else setSaveStatus('No saved plan yet. Inputs save automatically.');
      } catch { setSaveStatus('Could not load saved inputs.'); }
      finally { if (!cancelled) setHydrated(true); }
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
        const response = await fetch('/api/tool-state/adventure-stall', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: { cart, ownedShells, daysRemaining } }) });
        setSaveStatus(response.ok ? 'Saved to your member profile.' : response.status === 401 ? 'Log in to save this plan.' : 'Save failed.');
      } catch { setSaveStatus('Save failed.'); }
    }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [cart, daysRemaining, hydrated, ownedShells]);

  const days = clamp(daysRemaining, 0, 30);
  const limits = useMemo(() => packLimits(days, PACKS), [days, PACKS]);
  const totalShells = useMemo(() => SHOP_ITEMS.reduce((sum, item) => sum + item.shells * clamp(cart[item.key], 0, item.max), 0), [cart, SHOP_ITEMS]);
  const shellsToBuy = Math.max(0, totalShells - ownedShells);
  const plan = useMemo(() => optimizeShellPacks(shellsToBuy, days, PACKS), [days, shellsToBuy, PACKS]);
  const selectedItems = useMemo(() => SHOP_ITEMS.filter((item) => clamp(cart[item.key], 0, item.max) > 0), [cart, SHOP_ITEMS]);
  const availableShells = PACKS.reduce((sum, pack) => sum + pack.shells * limits[pack.key], 0);

  function setPreset(mode) {
    if (mode === 'clear') { setCart(EMPTY_CART); return; }
    setCart(Object.fromEntries(SHOP_ITEMS.map((item) => [item.key, mode === 'all' || LIMITED_KEYS.has(item.key) ? item.max : 0])));
  }

  return <section className="as-optimizer">
    <header className="as-summary-head"><div><h2>Adventure Stall Purchase Planner</h2><p>Select rewards by shop set. The optimizer minimizes cash cost first, then unused Shells, then pack count.</p></div><span className="as-save" role="status">{saveStatus}</span></header>

    <div className="as-start-grid">
      <label><span><b>Current Shells in Inventory</b><small>These are used before any paid packs.</small></span><input aria-label="Current Shells in Inventory" type="number" min="0" value={ownedShells} onChange={(event) => setOwnedShells(Math.max(0, Math.floor(Number(event.target.value) || 0)))}/></label>
      <label><span><b>Purchase Days Remaining</b><small>Daily pack limits multiply by this number.</small></span><input aria-label="Purchase Days Remaining" type="number" min="0" max="30" value={days} onChange={(event) => setDaysRemaining(clamp(event.target.value, 0, 30))}/></label>
    </div>

    <div className="as-preset-bar" aria-label="Reward cart presets"><button type="button" onClick={() => setPreset('limited')}>Max Featured Rewards</button><button type="button" onClick={() => setPreset('all')}>Max Everything</button><button type="button" className="quiet" onClick={() => setPreset('clear')}>Clear Cart</button></div>

    <div className="as-layout"><div className="as-main">
      <section className="as-panel"><div className="as-section-title"><div><h3>Reward Cart</h3><p>“Buy” is the number of shop sets; totals show the individual rewards received.</p></div><strong>{number(totalShells)} Shells</strong></div>
        <div className="as-shop-table" role="table" aria-label="Adventure Stall rewards"><div className="as-shop-row as-labels" role="row"><span>Reward</span><span>Each set</span><span>Stock</span><span>Buy</span><span>Shells</span></div>
          {SHOP_ITEMS.map((item) => { const quantity = clamp(cart[item.key], 0, item.max); return <div className="as-shop-row" role="row" key={item.key}><span className="as-reward"><b>{item.name}</b><small>{LIMITED_KEYS.has(item.key) ? 'Featured reward' : 'Stall reward'}</small></span><span>{number(item.reward)} {item.unit}<small>{number(item.shells)} Shells</small></span><span>{number(item.max)} sets</span><span><input aria-label={`${item.name} sets to buy`} type="number" min="0" max={item.max} value={quantity} onChange={(event) => setCart((current) => ({ ...current, [item.key]: clamp(event.target.value, 0, item.max) }))}/></span><span className="as-line-total">{number(quantity * item.shells)}</span></div>; })}
        </div>
      </section>
      <section className="as-panel"><div className="as-section-title"><div><h3>Daily Pack Availability</h3><p>Every pack resets daily. The $99.99 pack can be purchased three times per day.</p></div><strong>{number(availableShells)} max Shells</strong></div><div className="as-pack-grid">{PACKS.map((pack) => <div key={pack.key} className="as-pack"><span>{pack.name}</span><b>{money(pack.cents)} · {number(pack.shells)} Shells</b><small>{pack.perDay} per day · {limits[pack.key]} available</small></div>)}</div></section>
    </div><aside className="as-side">
      <section className="as-result-card"><h3>Cheapest Pack Plan</h3><div className="as-result-total"><span>Total spend</span><strong>{plan ? money(plan.costCents) : 'Unavailable'}</strong></div><div className="as-metrics"><div><span>Cart cost</span><b>{number(totalShells)}</b></div><div><span>Owned</span><b>{number(ownedShells)}</b></div><div><span>Need to buy</span><b>{number(shellsToBuy)}</b></div><div><span>Left over</span><b>{plan ? number(plan.overage) : '—'}</b></div></div>
        {plan ? <div className="as-plan-list">{PACKS.map((pack) => plan.quantities[pack.key] > 0 ? <div key={pack.key}><span>{pack.name}</span><b>{plan.quantities[pack.key]} × {money(pack.cents)}</b></div> : null)}{plan.count === 0 ? <p>No packs needed—your inventory covers this cart.</p> : null}</div> : <div className="as-warning">This cart needs more Shells than the daily pack limits provide across {days} day{days === 1 ? '' : 's'}. Add purchase days or reduce the reward cart.</div>}
      </section>
      <section className="as-panel as-selected"><h3>Selected Rewards</h3>{selectedItems.length ? selectedItems.map((item) => <div key={item.key}><span>{item.name}<small>{cart[item.key]} set{cart[item.key] === 1 ? '' : 's'}</small></span><b>{number(cart[item.key] * item.reward)} {item.unit}</b></div>) : <p>Your reward cart is empty.</p>}</section>
    </aside></div>

    <style jsx>{`
      .as-optimizer{--bg:#071923;--panel:#092530;--line:#24515a;--text:#eff8f3;--muted:#8cabaf;--shell:#ffd36f;border:1px solid rgba(86,211,195,.32);background:linear-gradient(145deg,#0d2831,#06131c 72%);border-radius:18px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.32)}
      .as-summary-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:16px}.as-summary-head h2{margin:0;color:var(--text);font:500 clamp(25px,4vw,36px)/1.1 Georgia,serif}.as-summary-head p{margin:7px 0 0;max-width:760px;color:var(--muted);font-size:13px;line-height:1.55}.as-save{flex:0 0 auto;color:#b9cdd0;font-size:11px;padding-top:6px}
      .as-start-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.as-start-grid label{display:grid;grid-template-columns:minmax(0,1fr) 145px;align-items:center;gap:16px;padding:14px 16px;border:1px solid rgba(86,211,195,.48);background:linear-gradient(100deg,rgba(15,91,93,.38),rgba(8,34,43,.88));border-radius:11px;color:#e8f7ef}.as-start-grid span,.as-start-grid small{display:block}.as-start-grid b{font-size:13px}.as-start-grid small{margin-top:4px;color:#8db8b3;font-size:10px;font-weight:400}.as-start-grid input,.as-shop-row input{width:100%;box-sizing:border-box;border:1px solid #3f8b8c;background:#04151c;color:#ffdf8a;border-radius:8px;padding:10px;font:800 15px var(--font-mono)}
      .as-preset-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.as-preset-bar button{border:1px solid #2d8e87;background:linear-gradient(180deg,#269c91,#14665f);color:#edfffb;border-radius:8px;padding:9px 12px;font-size:11px;font-weight:800;cursor:pointer}.as-preset-bar button.quiet{background:#0a202a;border-color:#31545b;color:#bad0d1}.as-preset-bar button:hover{filter:brightness(1.1)}
      .as-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(310px,.72fr);gap:16px}.as-main,.as-side{display:flex;flex-direction:column;gap:16px}.as-panel,.as-result-card{border:1px solid var(--line);background:rgba(8,34,43,.94);border-radius:13px;padding:16px}.as-panel h3,.as-result-card h3{margin:0;color:#e5f1ed;font-size:12px;letter-spacing:.11em;text-transform:uppercase}.as-section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:13px}.as-section-title p{color:var(--muted);font-size:11px;line-height:1.5;margin:5px 0 0}.as-section-title>strong{color:var(--shell);font:700 16px/1.2 var(--font-mono);white-space:nowrap}
      .as-shop-table{border-top:1px solid var(--line)}.as-shop-row{display:grid;grid-template-columns:minmax(180px,1.45fr) minmax(130px,1fr) 78px 82px 82px;gap:10px;align-items:center;min-height:66px;border-bottom:1px solid rgba(36,81,90,.75);color:#c8dad9;font-size:12px}.as-labels{min-height:35px;color:#71969a;font-size:9px;text-transform:uppercase;letter-spacing:.09em}.as-shop-row>span:last-child{text-align:right}.as-reward b{display:block;color:#edf8f3;font-size:13px}.as-shop-row small{display:block;margin-top:4px;color:#72979a;font-size:9px}.as-line-total{color:var(--shell);font-weight:800;font-family:var(--font-mono)}
      .as-pack-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.as-pack{border:1px solid #28515a;background:#061b24;border-radius:9px;padding:11px;color:#d9e8e5;font-size:11px}.as-pack b,.as-pack small{display:block;margin-top:5px;color:#86a8aa;font-size:9px;font-weight:500}.as-result-card{position:sticky;top:16px;border-color:#3c9b91;background:linear-gradient(165deg,#0d3b3c,#101c23 58%)}.as-result-total{display:flex;align-items:flex-end;justify-content:space-between;margin:18px 0;padding-bottom:14px;border-bottom:1px solid rgba(86,211,195,.25)}.as-result-total span{color:#9abdb8;font-size:11px}.as-result-total strong{color:#ffe08f;font:500 34px Georgia,serif}.as-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px}.as-metrics div{background:rgba(4,18,24,.58);border:1px solid #315359;border-radius:8px;padding:9px}.as-metrics span{display:block;color:#78999c;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.as-metrics b{display:block;color:#eef7f2;font-size:15px;margin-top:3px}.as-plan-list{margin-top:14px}.as-plan-list div,.as-selected div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(36,81,90,.68);font-size:11px;color:#bdd1d0}.as-plan-list b,.as-selected b{color:#ffe4a0;text-align:right}.as-plan-list p,.as-selected p{color:#7d9da0;font-size:11px}.as-warning{margin-top:13px;padding:11px;border:1px solid rgba(255,112,88,.35);background:rgba(255,86,55,.08);border-radius:8px;color:#ffc0b2;font-size:11px;line-height:1.5}.as-selected small{display:block;color:#719497;font-size:9px;margin-top:3px}
      @media(max-width:1050px){.as-layout{grid-template-columns:1fr}.as-result-card{position:static}.as-pack-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.as-optimizer{padding:13px}.as-summary-head{flex-direction:column}.as-save{padding:0}.as-start-grid{grid-template-columns:1fr}.as-start-grid label{grid-template-columns:1fr}.as-shop-table{overflow-x:auto}.as-shop-row{min-width:710px}.as-pack-grid{grid-template-columns:1fr}.as-section-title{flex-direction:column}.as-result-total strong{font-size:30px}}
    `}</style>
  </section>;
}
