import { getCollection } from './mongo.js';
import { toolConfiguration } from './toolCatalog.mjs';
import { resolveToolStorageKey } from './toolKeys.mjs';
import { isCustomPackTool, withCustomPacks } from './customPacks.mjs';
import { charmLevelsFromRows, mergeReferenceRows } from './toolReferenceTables.mjs';

export async function loadToolConfiguration(requestedTool) {
  // Overrides stay stored under the original key even if the slug was renamed.
  const tool = resolveToolStorageKey(requestedTool);
  let configuration;
  try {
    const coll = await getCollection('tool_settings');
    const data = await coll.findOne(
      { tool_key: tool },
      { projection: { quantities: 1, _id: 0 } }
    );
    configuration = toolConfiguration(tool, data?.quantities || {});
  } catch {
    throw new Error('Tool quantities could not be loaded. Please try again.');
  }
  // Admin extras are optional: if they cannot be read the built-in values still work.
  if (isCustomPackTool(tool)) {
    try {
      const packs = await getCollection('tool_custom_packs');
      configuration = withCustomPacks(tool, configuration, await packs.find({ tool_key: tool, enabled: { $ne: false } }).toArray());
    } catch { /* built-in packs only */ }
  }
  if (tool === 'charm-pack-optimizer') {
    try {
      const tables = await getCollection('tool_reference_tables');
      const doc = await tables.findOne({ key: 'charm-levels' }, { projection: { rows: 1, _id: 0 } });
      if (doc?.rows) configuration = { ...configuration, charmLevels: charmLevelsFromRows(mergeReferenceRows('charm-levels', doc.rows)) };
    } catch { /* built-in charm stats */ }
  }
  return configuration;
}
