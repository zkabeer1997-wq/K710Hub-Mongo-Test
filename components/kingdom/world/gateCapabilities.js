// Capability checks shared by the homepage shield loader and Gate scene.

export function detectWebGL() {
  if (typeof window === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

export function detectQuality() {
  if (typeof window === 'undefined') return 'standard';
  const w = window.innerWidth;
  const mem = navigator.deviceMemory || 4;
  if (w < 820 || mem <= 2) return 'mobile';
  if (w >= 1600 && mem >= 8) return 'ultra';
  return 'standard';
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// navigator.connection is Chromium-only and absent everywhere else; treat
// its absence as "not on a constrained connection" rather than blocking
// the scene for browsers that simply don't expose the signal.
export function wantsDataSaver() {
  if (typeof navigator === 'undefined' || !navigator.connection) return false;
  return Boolean(navigator.connection.saveData);
}
