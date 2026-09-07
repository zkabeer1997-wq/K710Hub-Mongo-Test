export const TOOL_STATE_ENVELOPE_VERSION = 1;

export function createToolStateEnvelope(toolKey, schemaVersion, inputs) {
  if (!toolKey || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new TypeError('A tool key and positive schema version are required.');
  }
  return {
    envelopeVersion: TOOL_STATE_ENVELOPE_VERSION,
    toolKey,
    schemaVersion,
    inputs,
  };
}

export function readToolState(raw, { toolKey, schemaVersion, migrate }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  // Records written before the shared persistence layer stored inputs directly.
  const legacy = raw.envelopeVersion === undefined;
  const fromVersion = legacy ? 0 : Number(raw.schemaVersion || 0);
  const inputs = legacy ? raw : raw.inputs;
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return null;
  if (!legacy && raw.toolKey !== toolKey) return null;
  if (fromVersion > schemaVersion) return null;

  const migrated = fromVersion === schemaVersion
    ? inputs
    : migrate(inputs, fromVersion, schemaVersion);
  return migrated && typeof migrated === 'object' && !Array.isArray(migrated)
    ? migrated
    : null;
}

export function migratePetPackState(inputs) {
  return {
    need: inputs.need,
    have: inputs.have,
    ownedChests: inputs.ownedChests,
    maxWeeks: inputs.maxWeeks,
  };
}
