"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminShell from "../../../../components/admin/AdminShell";
import { Button } from "../../../../components/ui";
import {
  validateToolQuantities,
  defaultQuantities,
} from "../../../../lib/toolCatalog.mjs";
export default function ToolEditingPage() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/admin-logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }
  const [tools, setTools] = useState([]),
    [selected, setSelected] = useState(""),
    [values, setValues] = useState({}),
    [status, setStatus] = useState(""),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false),
    [query, setQuery] = useState(""),
    [history, setHistory] = useState([]),
    [sourceNote, setSourceNote] = useState(""),
    [verificationStatus, setVerificationStatus] =
      useState("community-reported"),
    [lastVerified, setLastVerified] = useState(""),
    [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    fetch("/api/admin-tool-settings", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setTools(d.tools);
        setSelected(d.tools[0]?.key || "");
        setValues(d.tools[0]?.quantities || {});
        setHistory(d.history || []);
      })
      .catch((e) => setStatus(e.message));
  }, []);
  const tool = tools.find((t) => t.key === selected);
  function choose(key) {
    setSelected(key);
    setValues(tools.find((t) => t.key === key)?.quantities || {});
    setDirty(false);
    setStatus("");
    setQuery("");
  }
  async function save() {
    const { quantities, error } = validateToolQuantities(selected, values);
    if (error) {
      setStatus(error);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin-tool-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: selected,
          quantities,
          sourceNote,
          verificationStatus,
          lastVerified,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setTools((prev) =>
        prev.map((t) =>
          t.key === selected ? { ...t, quantities: d.quantities } : t,
        ),
      );
      setDirty(false);
      setHistory((previous) => [
        {
          tool_key: selected,
          quantities,
          source_note: sourceNote,
          verification_status: verificationStatus,
          last_verified: lastVerified || null,
          created_at: new Date().toISOString(),
        },
        ...previous,
      ]);
      setPreviewing(false);
      setStatus(
        "Saved. Members will use these quantities when they open or reload the tool.",
      );
    } catch (e) {
      setStatus(e.message);
    } finally {
      setSaving(false);
    }
  }
  const fields =
    tool?.fields.filter((f) =>
      `${f.group} ${f.label}`.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  const groups = [...new Set(fields.map((f) => f.group))];
  const selectedHistory = history
    .filter((entry) => entry.tool_key === selected)
    .slice(0, 10);
  const changedFields =
    tool?.fields.filter(
      (field) => values[field.key] !== tool.quantities[field.key],
    ) || [];
  return (
    <AdminShell
      onLogout={logout}
      title="Tool Editing"
      subtitle="Update item quantities used by the calculators"
    >
      <p>
        Pack prices, merge chances, purchase rules, and calculation methods stay
        fixed. Changes apply to the selected tool.
      </p>
      <div className="tool-edit-toolbar">
        <label>
          Tool
          <select
            value={selected}
            disabled={saving || dirty}
            onChange={(e) => choose(e.target.value)}
          >
            {tools.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Find an item
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Item, pack, or charm level"
          />
        </label>
      </div>
      {status && <p role="status">{status}</p>}
      {dirty && <p>Unsaved changes. Save or discard before changing tools.</p>}
      <div className="tool-edit-actions">
        <Button
          onClick={() => setPreviewing(true)}
          disabled={!tool || saving || !dirty}
        >
          Preview changes
        </Button>
        <Button
          variant="quiet"
          disabled={!dirty || saving}
          onClick={() => choose(selected)}
        >
          Discard changes
        </Button>
        <Button
          variant="quiet"
          disabled={!tool || saving}
          onClick={() => {
            setValues(defaultQuantities(selected));
            setDirty(true);
            setStatus("Defaults restored in the editor. Save to apply.");
          }}
        >
          Restore defaults
        </Button>
      </div>
      <section className="tool-edit-meta">
        <label>
          Verification status
          <select
            value={verificationStatus}
            onChange={(e) => {
              setVerificationStatus(e.target.value);
              setDirty(true);
            }}
          >
            <option value="verified">Verified</option>
            <option value="community-reported">Community-reported</option>
            <option value="experimental">Experimental</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </label>
        <label>
          Last verified
          <input
            type="date"
            value={lastVerified}
            onChange={(e) => {
              setLastVerified(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label>
          Source note
          <input
            value={sourceNote}
            maxLength="1000"
            onChange={(e) => {
              setSourceNote(e.target.value);
              setDirty(true);
            }}
            placeholder="URL, screenshot, or in-game verification note"
          />
        </label>
      </section>
      <fieldset disabled={saving} className="tool-edit-grid">
        {groups.map((group) => (
          <section className="tool-edit-card" key={group}>
            <h2>{group}</h2>
            {fields
              .filter((f) => f.group === group)
              .map((f) => (
                <label key={f.key}>
                  {f.label}
                  <input
                    aria-label={`${group}: ${f.label}`}
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={values[f.key] ?? ""}
                    onChange={(e) => {
                      setValues((prev) => ({
                        ...prev,
                        [f.key]:
                          e.target.value === "" ? "" : Number(e.target.value),
                      }));
                      setDirty(true);
                    }}
                  />
                </label>
              ))}
          </section>
        ))}
      </fieldset>
      <section className="tool-edit-history">
        <h2>Published versions</h2>
        {selectedHistory.length ? (
          selectedHistory.map((entry, index) => (
            <article key={entry.id || `${entry.created_at}-${index}`}>
              <div>
                <strong>{entry.verification_status}</strong>
                <span>{new Date(entry.created_at).toLocaleString()}</span>
                <small>
                  {entry.source_note || "No source note recorded"}
                  {entry.last_verified
                    ? ` · Verified ${entry.last_verified}`
                    : ""}
                </small>
              </div>
              <Button
                variant="quiet"
                onClick={() => {
                  setValues(entry.quantities);
                  setDirty(true);
                  setStatus(
                    "Historical values loaded into the editor. Preview and publish to restore them.",
                  );
                }}
              >
                Restore this version
              </Button>
            </article>
          ))
        ) : (
          <p>No version history has been recorded yet.</p>
        )}
      </section>
      {previewing && (
        <div
          className="tool-edit-preview"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
        >
          <div>
            <h2 id="preview-title">Preview configuration changes</h2>
            <p>
              {changedFields.length} value
              {changedFields.length === 1 ? "" : "s"} will change for{" "}
              {tool.label}.
            </p>
            <ul>
              {changedFields.slice(0, 20).map((field) => (
                <li key={field.key}>
                  <span>
                    {field.group} — {field.label}
                  </span>
                  <b>
                    {tool.quantities[field.key]} → {values[field.key]}
                  </b>
                </li>
              ))}
            </ul>
            {changedFields.length > 20 && (
              <p>Plus {changedFields.length - 20} more changes.</p>
            )}
            <p>
              Status: {verificationStatus}
              {lastVerified ? ` · verified ${lastVerified}` : ""}
            </p>
            <div className="tool-edit-actions">
              <Button onClick={save} disabled={saving}>
                {saving ? "Publishing…" : "Publish version"}
              </Button>
              <Button
                variant="quiet"
                onClick={() => setPreviewing(false)}
                disabled={saving}
              >
                Return to editor
              </Button>
            </div>
          </div>
        </div>
      )}
      <style>{`.tool-edit-toolbar,.tool-edit-actions{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0}.tool-edit-toolbar label{flex:1;min-width:220px}.tool-edit-meta{display:grid;grid-template-columns:220px 180px minmax(260px,1fr);gap:12px;margin:18px 0;padding:16px;border:1px solid var(--edge);border-radius:10px}.tool-edit-meta label{display:flex;flex-direction:column;gap:6px;font-size:11px}.tool-edit-grid{border:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:16px}.tool-edit-card{padding:18px;border:1px solid var(--edge);border-radius:10px}.tool-edit-card h2{font-size:17px;margin:0 0 14px}.tool-edit-card label{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:12px;margin:10px 0}.tool-edit-card input{max-width:130px}.tool-edit-history{margin-top:28px}.tool-edit-history article{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:12px 0;border-bottom:1px solid var(--edge)}.tool-edit-history article div{display:flex;flex-direction:column;gap:3px}.tool-edit-history span,.tool-edit-history small{color:var(--t-secondary);font-size:11px}.tool-edit-preview{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.72)}.tool-edit-preview>div{width:min(620px,100%);max-height:85vh;overflow:auto;padding:24px;border:1px solid var(--edge-strong);border-radius:12px;background:var(--stone)}.tool-edit-preview li{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px solid var(--edge);font-size:12px}@media(max-width:800px){.tool-edit-meta{grid-template-columns:1fr}.tool-edit-history article{align-items:flex-start;flex-direction:column}}`}</style>
    </AdminShell>
  );
}
