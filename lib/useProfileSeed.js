"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { profileIsNewer } from "./profileToTools.mjs";

// Starts a tool from the member's saved Power Profile.
// - Tool has no saved inputs of its own: apply the profile once, automatically.
// - Tool already has saved inputs: never overwrite; offer a notice when the
//   profile is newer than the tool's saved state and would change something.
// `save` is the tool's own save (persistence.saveNow). `enabled` should turn true once the tool has finished restoring its own state.
export function useProfileSeed({ toolKey, enabled, hasValues, differs, apply, save }) {
  const [notice, setNotice] = useState(null);
  const [seeded, setSeeded] = useState(null);
  const [applied, setApplied] = useState(0);
  const latest = useRef({ hasValues, differs, apply, save });
  const started = useRef(false);
  const profileRef = useRef(null);
  const dismissKey = `k710-profile-seed:${toolKey}`;

  useEffect(() => {
    latest.current = { hasValues, differs, apply, save };
  });

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    const controller = new AbortController();
    (async () => {
      try {
        const [stateResponse, profileResponse] = await Promise.all([
          fetch(`/api/tool-state/${toolKey}`, { cache: "no-store", signal: controller.signal }),
          fetch("/api/member-power-profile", { cache: "no-store", signal: controller.signal }),
        ]);
        if (!stateResponse.ok || !profileResponse.ok) return;
        const [{ state, updatedAt }, { profile }] = await Promise.all([stateResponse.json(), profileResponse.json()]);
        if (!profile || !latest.current.hasValues(profile)) return;
        profileRef.current = profile;
        if (!state) {
          latest.current.apply(profile);
          setSeeded(profile.updated_at || "");
          return;
        }
        if (!profileIsNewer(profile.updated_at, updatedAt) || !latest.current.differs(profile)) return;
        try {
          if (localStorage.getItem(dismissKey) === profile.updated_at) return;
        } catch {}
        setNotice({ updatedAt: profile.updated_at });
      } catch {
        // The tool works the same without the profile.
      }
    })();
    return () => controller.abort();
  }, [dismissKey, enabled, toolKey]);

  const applyProfile = useCallback(() => {
    if (profileRef.current) latest.current.apply(profileRef.current);
    setNotice(null);
    setApplied((count) => count + 1);
  }, []);

  // After the tool re-rendered with the profile values, save them through the
  // tool's own persistence (the tool's auto-detect can miss a change that
  // follows restoring identical saved inputs).
  useEffect(() => {
    if (applied > 0 && latest.current.save) latest.current.save();
  }, [applied]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(dismissKey, profileRef.current?.updated_at || "");
    } catch {}
    setNotice(null);
  }, [dismissKey]);

  return { notice, seeded, applyProfile, dismiss };
}
