"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createToolStateEnvelope, readToolState } from "./toolState.mjs";

export function useToolPersistence({
  toolKey,
  schemaVersion,
  inputs,
  restore,
  migrate,
  onEmpty,
  debounceMs = 800,
  autoDetect = false,
}) {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Loading saved inputs…");
  const ready = useRef(false);
  const changed = useRef(false);
  const timer = useRef(null);
  const lastSaved = useRef("");
  const initialInputs = useRef(inputs);
  const latestInputs = useRef(inputs);
  const suppressRestoredChange = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [hasPrevious, setHasPrevious] = useState(false);
  const historyKey = `k710-tool-history:${toolKey}`;

  useEffect(() => {
    latestInputs.current = inputs;
  }, [inputs]);

  const readHistory = useCallback(() => {
    try {
      const value = JSON.parse(localStorage.getItem(historyKey) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }, [historyKey]);

  const remember = useCallback(
    (value) => {
      try {
        const history = readHistory();
        if (history.at(-1)?.serialized === value) return;
        history.push({ serialized: value, savedAt: new Date().toISOString() });
        localStorage.setItem(historyKey, JSON.stringify(history.slice(-10)));
        setHasPrevious(history.length > 1);
      } catch {
        // Server persistence remains authoritative when local storage is blocked.
      }
    },
    [historyKey, readHistory],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/tool-state/${toolKey}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401) {
          setStatus("signed-out");
          setMessage("Sign in as a member to restore and save inputs.");
          return;
        }
        if (!response.ok) throw new Error("Could not load saved inputs.");
        const body = await response.json();
        const saved = readToolState(body.state, {
          toolKey,
          schemaVersion,
          migrate,
        });
        if (saved) {
          suppressRestoredChange.current = autoDetect;
          restore(saved);
          lastSaved.current = JSON.stringify(
            createToolStateEnvelope(toolKey, schemaVersion, saved),
          );
          setStatus("saved");
          setMessage("Saved inputs restored.");
          setHasPrevious(readHistory().length > 1);
        } else {
          if (onEmpty) {
            suppressRestoredChange.current = autoDetect;
            await onEmpty();
          }
          lastSaved.current = JSON.stringify(
            createToolStateEnvelope(
              toolKey,
              schemaVersion,
              initialInputs.current,
            ),
          );
          setStatus("idle");
          setMessage("Inputs save automatically after you make a change.");
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setStatus("error");
          setMessage(error.message);
        }
      } finally {
        if (!controller.signal.aborted) ready.current = true;
      }
    }
    load();
    return () => {
      controller.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [autoDetect, migrate, onEmpty, readHistory, restore, schemaVersion, toolKey]);

  const persist = useCallback(
    async (value = latestInputs.current, successMessage = "Saved to account roadmap") => {
      const envelope = createToolStateEnvelope(toolKey, schemaVersion, value);
      const serialized = JSON.stringify(envelope);
      setStatus("saving");
      setMessage("Saving to account roadmap…");
      try {
        const response = await fetch(`/api/tool-state/${toolKey}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: envelope }),
        });
        if (response.status === 401) {
          setStatus("signed-out");
          setMessage("Sign in as a member to save this plan to your roadmap.");
          return false;
        }
        if (!response.ok) throw new Error("Save failed. Your inputs are still visible on this page.");
        remember(serialized);
        lastSaved.current = serialized;
        changed.current = false;
        setLastSavedAt(new Date().toISOString());
        setStatus("saved");
        setMessage(successMessage);
        return true;
      } catch (error) {
        setStatus("error");
        setMessage(error.message);
        return false;
      }
    },
    [remember, schemaVersion, toolKey],
  );

  const saveNow = useCallback(() => persist(), [persist]);

  const restorePrevious = useCallback(() => {
    const history = readHistory();
    if (history.length < 2) return false;
    history.pop();
    const previous = history.at(-1);
    try {
      const envelope = JSON.parse(previous.serialized);
      restore(envelope.inputs);
      localStorage.setItem(historyKey, JSON.stringify(history));
      lastSaved.current = previous.serialized;
      changed.current = true;
      setHasPrevious(history.length > 1);
      setStatus("dirty");
      setMessage("Previous plan restored. Save it to confirm the change.");
      return true;
    } catch {
      setStatus("error");
      setMessage("The previous plan could not be restored.");
      return false;
    }
  }, [historyKey, readHistory, restore]);

  const markChanged = useCallback(() => {
    if (!ready.current) return;
    changed.current = true;
    setStatus("dirty");
    setMessage("Unsaved changes");
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    const envelope = createToolStateEnvelope(toolKey, schemaVersion, inputs);
    const serialized = JSON.stringify(envelope);
    if (
      autoDetect &&
      suppressRestoredChange.current &&
      serialized !== lastSaved.current
    ) {
      suppressRestoredChange.current = false;
      lastSaved.current = serialized;
      return;
    }
    if (autoDetect && serialized !== lastSaved.current) changed.current = true;
    if (!changed.current) return;
    if (serialized === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(inputs), debounceMs);
    return () => clearTimeout(timer.current);
  }, [autoDetect, debounceMs, inputs, persist, schemaVersion, toolKey]);

  return {
    status,
    message,
    markChanged,
    saveNow,
    restorePrevious,
    hasPrevious,
    lastSavedAt,
  };
}
