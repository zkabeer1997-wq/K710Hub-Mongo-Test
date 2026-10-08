'use client';

import { createContext, useContext } from 'react';

export const BuilderContext = createContext(null);

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilder must be used inside GuideBuilder');
  return ctx;
}
