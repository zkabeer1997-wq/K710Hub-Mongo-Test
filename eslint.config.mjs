import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// eslint-config-next@16 ships flat config natively (an array of config
// objects), replacing the old next/core-web-vitals shareable-config string
// that .eslintrc.json used to reference. `next lint` itself was removed in
// Next 16 in favor of running ESLint directly - see the "lint" script in
// package.json.
const config = [
  ...nextCoreWebVitals,
  {
    // eslint-plugin-react-hooks v6 (bundled by eslint-config-next@16) adds
    // four new error-level rules preparing codebases for the React
    // Compiler: set-state-in-effect, purity, immutability, and
    // preserve-manual-memoization. They flag ~30 pre-existing, working
    // patterns across the app (Math.random() in a useMemo for stable
    // particle placement, setState-in-effect for restoring saved tool
    // inputs, etc.) that predate this migration and aren't part of what a
    // Next 14->16 security upgrade requires fixing. Adopting React
    // Compiler readiness is a real, separate initiative that deserves its
    // own review pass, not a side effect of a dependency bump - so these
    // stay off for now, keeping the enforced lint bar the same as before
    // the upgrade.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  {
    ignores: ['.next/**', 'out/**', 'build/**'],
  },
];

export default config;
