'use client';

import { createContext, useContext } from 'react';

// Admin-edited glossary terms for the tooltips ({term, definition}[]), or null
// to use the built-in list. Passed down from the root layout as plain JSON so
// the lookup in <Term> stays synchronous and never blocks rendering.
const GlossaryContext = createContext(null);

export function useGlossaryTerms() { return useContext(GlossaryContext); }

export default function GlossaryProvider({ terms = null, children }) {
  return <GlossaryContext.Provider value={terms}>{children}</GlossaryContext.Provider>;
}
