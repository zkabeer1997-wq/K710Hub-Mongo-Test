function whole(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

export function maximizeCurrencyUnderBudget(budgetCents, limits, packs) {
  const budget = whole(budgetCents);
  let states = new Map([
    [0, { currency: 0, count: 0, quantities: Array(packs.length).fill(0) }],
  ]);
  packs.forEach((pack, packIndex) => {
    const next = new Map();
    const maximum = whole(limits?.[pack.key]);
    for (const [spent, state] of states) {
      for (let quantity = 0; quantity <= maximum; quantity += 1) {
        const cost = spent + quantity * pack.cents;
        if (cost > budget) break;
        const candidate = {
          currency:
            state.currency + quantity * (pack.essence ?? pack.shells ?? 0),
          count: state.count + quantity,
          quantities: state.quantities.map((value, index) =>
            index === packIndex ? value + quantity : value,
          ),
        };
        const existing = next.get(cost);
        if (
          !existing ||
          candidate.currency > existing.currency ||
          (candidate.currency === existing.currency &&
            candidate.count < existing.count)
        )
          next.set(cost, candidate);
      }
    }
    states = next;
  });
  let best = {
    spentCents: 0,
    currency: 0,
    count: 0,
    quantities: Array(packs.length).fill(0),
  };
  for (const [spentCents, state] of states) {
    if (
      state.currency > best.currency ||
      (state.currency === best.currency && spentCents < best.spentCents) ||
      (state.currency === best.currency &&
        spentCents === best.spentCents &&
        state.count < best.count)
    )
      best = { ...state, spentCents };
  }
  return {
    ...best,
    quantities: Object.fromEntries(
      packs.map((pack, index) => [pack.key, best.quantities[index]]),
    ),
  };
}

export function allocateShopCurrency({
  items,
  currency,
  priorities = {},
  excluded = {},
  mustBuy = {},
  minimums = {},
}) {
  const budget = whole(currency);
  const normalized = items.map((item) => {
    const stock = whole(item.max);
    const minimum = Math.min(stock, whole(minimums[item.key]));
    const required = excluded[item.key]
      ? 0
      : mustBuy[item.key]
        ? stock
        : minimum;
    return {
      ...item,
      stock,
      required,
      weight: Math.max(0, Number(priorities[item.key]) || 0),
      cost: whole(item.essence ?? item.shells),
    };
  });
  const requiredCost = normalized.reduce(
    (sum, item) => sum + item.required * item.cost,
    0,
  );
  if (requiredCost > budget)
    return {
      feasible: false,
      requiredCost,
      currency: budget,
      shortfall: requiredCost - budget,
      quantities: Object.fromEntries(
        normalized.map((item) => [item.key, item.required]),
      ),
    };

  const quantities = Object.fromEntries(
    normalized.map((item) => [item.key, item.required]),
  );
  let remaining = budget - requiredCost;
  const candidates = normalized
    .filter((item) => !excluded[item.key] && item.cost > 0 && item.weight > 0)
    .sort(
      (a, b) =>
        b.weight / b.cost - a.weight / a.cost ||
        b.weight - a.weight ||
        a.cost - b.cost ||
        a.key.localeCompare(b.key),
    );
  for (const item of candidates) {
    const count = Math.min(
      item.stock - quantities[item.key],
      Math.floor(remaining / item.cost),
    );
    quantities[item.key] += count;
    remaining -= count * item.cost;
  }
  const selected = normalized
    .filter((item) => quantities[item.key] > 0)
    .map((item) => ({
      key: item.key,
      quantity: quantities[item.key],
      reason: mustBuy[item.key]
        ? "Required as a must-buy."
        : item.required > 0
          ? `Includes the minimum of ${item.required}.`
          : `Selected for priority ${item.weight} at ${item.cost.toLocaleString()} currency per set.`,
    }));
  return {
    feasible: true,
    currency: budget,
    spent: budget - remaining,
    leftover: remaining,
    quantities,
    selected,
  };
}
