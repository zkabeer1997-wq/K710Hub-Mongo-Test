'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { detectQuality, detectWebGL, prefersReducedMotion, wantsDataSaver } from './gateCapabilities';

// Mirrors GateBackdrop.jsx's pattern: the heavy three.js/@react-three/fiber
// module graph must not ship in the homepage's initial client bundle, and
// `ssr: false` is only permitted inside a Client Component in this Next.js
// version - so the dynamic() call lives here, not in the Server Component
// (app/page.js) that renders this wrapper.
const RealmShield3D = dynamic(() => import('./RealmShield3D'), { ssr: false });

export default function RealmShieldLoader() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(
      detectWebGL() &&
      detectQuality() !== 'mobile' &&
      !prefersReducedMotion() &&
      !wantsDataSaver(),
    );
  }, []);
  return enabled ? <RealmShield3D /> : null;
}
