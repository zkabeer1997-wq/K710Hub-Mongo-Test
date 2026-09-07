function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let out = 1;
  for (let i = 1; i <= k; i += 1) out = (out * (n - k + i)) / i;
  return out;
}
export function probabilityAtLeast(n, k, p = 0.25) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let total = 0;
  for (let i = k; i <= n; i += 1)
    total += choose(n, i) * p ** i * (1 - p) ** (n - i);
  return Math.min(1, total);
}
export function probabilityExactly(n, k, p = 0.25) {
  return choose(n, k) * p ** k * (1 - p) ** (n - k);
}
