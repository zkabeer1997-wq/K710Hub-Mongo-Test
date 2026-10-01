import { getCollection } from './mongo.js';
import { toolConfiguration } from './toolCatalog.mjs';
import { resolveToolStorageKey } from './toolKeys.mjs';

export async function loadToolConfiguration(requestedTool) {
  // Overrides stay stored under the original key even if the slug was renamed.
  const tool = resolveToolStorageKey(requestedTool);
  try {
    const coll = await getCollection('tool_settings');
    const data = await coll.findOne(
      { tool_key: tool },
      { projection: { quantities: 1, _id: 0 } }
    );
    return toolConfiguration(tool, data?.quantities || {});
  } catch {
    throw new Error('Tool quantities could not be loaded. Please try again.');
  }
}
