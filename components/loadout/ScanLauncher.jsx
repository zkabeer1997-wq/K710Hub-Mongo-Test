// Placeholder for the screenshot scan. The next phase swaps the disabled button for the real launcher:
// keep the props (onApply receives { gear, charms } selection maps, same shape the form state uses).
export default function ScanLauncher({ enabled = false, onLaunch }) {
  return (
    <div className="lo-scan">
      <button
        type="button"
        className="lo-btn lo-btn-secondary"
        disabled={!enabled}
        aria-describedby="lo-scan-note"
        onClick={enabled ? onLaunch : undefined}
      >
        Scan a screenshot
      </button>
      <p id="lo-scan-note" className="lo-note">Screenshot scanning is coming soon. Fill in your gear below.</p>
    </div>
  );
}
