'use client';

import { useState } from 'react';
import { Select, Input } from '../../ui';
import styles from './HeroGearPlanner.module.css';

export default function PresetBar({ presets, activePresetId, onSelect, onCreate, onShare, onDelete }) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  function submitCreate() {
    const name = draftName.trim();
    if (!name) return;
    onCreate(name);
    setDraftName('');
    setCreating(false);
  }

  return (
    <div className={styles.presetRow}>
      {creating ? (
        <>
          <Input
            autoFocus
            placeholder="Build name, e.g. Cavalry rush"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate();
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <button type="button" className="ui-btn" onClick={submitCreate}>Save</button>
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => setCreating(false)}>Cancel</button>
        </>
      ) : (
        <>
          <Select
            aria-label="Saved builds"
            value={activePresetId || ''}
            onChange={(e) => onSelect(e.target.value || null)}
          >
            <option value="">Unsaved working build</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </Select>
          <button
            type="button"
            className={styles.iconButton}
            title="Save as a new build"
            aria-label="Save as a new build"
            onClick={() => setCreating(true)}
          >
            +
          </button>
          <button
            type="button"
            className={styles.iconButton}
            title="Copy a shareable link to this build"
            aria-label="Copy a shareable link to this build"
            onClick={() => onShare(activePresetId)}
            disabled={!activePresetId}
          >
            ⇪
          </button>
          {activePresetId && (
            <button
              type="button"
              className={styles.iconButton}
              title="Delete this build"
              aria-label="Delete this build"
              onClick={() => onDelete(activePresetId)}
            >
              ✕
            </button>
          )}
        </>
      )}
    </div>
  );
}
