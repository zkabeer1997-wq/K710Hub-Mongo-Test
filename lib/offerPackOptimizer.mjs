export function optimizeOfferPacks(offers, requirements) {
  const keys = Object.keys(requirements);
  const usable = offers.filter((offer) => Number(offer.price) > 0 && Number(offer.limit) > 0 && keys.some((key) => Number(offer[key]) > 0));
  if (!keys.some((key) => Number(requirements[key]) > 0)) return { cost: 0, picks: [], totals: Object.fromEntries(keys.map((key) => [key, 0])) };
  let best = null;
  const visit = (index, totals, cost, picks) => {
    if (best && cost >= best.cost) return;
    if (keys.every((key) => totals[key] >= requirements[key])) {
      best = { cost, picks: picks.filter((pick) => pick.quantity), totals: { ...totals } };
      return;
    }
    if (index >= usable.length) return;
    const offer = usable[index];
    for (let quantity = 0; quantity <= Math.min(20, Number(offer.limit) || 0); quantity += 1) {
      visit(index + 1, Object.fromEntries(keys.map((key) => [key, totals[key] + quantity * (Number(offer[key]) || 0)])), cost + quantity * Number(offer.price), [...picks, { name: offer.name || `Offer ${index + 1}`, quantity, price: Number(offer.price) }]);
    }
  };
  visit(0, Object.fromEntries(keys.map((key) => [key, 0])), 0, []);
  return best;
}
