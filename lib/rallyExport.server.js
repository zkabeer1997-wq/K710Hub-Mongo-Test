import 'server-only';
import { ObjectId } from 'mongodb';
import { getCollection } from './mongo';
import { COLLECTIONS } from './mongoCollections';
import { getCurrentEventCycle, loadCycleRoster } from './eventCycles.server';
import { loadSavedRallies } from './rallyRoute.server';
import { buildRallyWorkbook, cycleNumberOf } from './rallyExport.mjs';
import { buildStyledXlsx } from './styledXlsx.mjs';

const EVENTS = {
  kvk: { name: 'KvK', collection: 'ADMIN_RALLIES' },
  flamedragon: { name: 'Flamedragon Tyrant', collection: 'FLAMEDRAGON_ADMIN_RALLIES' },
};

export function isRallyEventType(type) {
  return Object.prototype.hasOwnProperty.call(EVENTS, type);
}

/** Builds the export from what is SAVED: the current cycle's stored rallies and its roster. Nothing is regenerated. */
export async function buildSavedRallyExport(type, now = new Date()) {
  const event = EVENTS[type];
  const cycle = await getCurrentEventCycle(type);
  const { rallies } = await loadSavedRallies(type, event.collection);
  const roster = cycle ? await loadCycleRoster(type, cycle.id) : null;
  const rows = roster?.rows || [];
  const cycleLabel = cycle?.label || event.name;
  const sheets = buildRallyWorkbook({ eventType: type, cycleNumber: cycleNumberOf(cycleLabel), rallies, rows });
  const date = now.toISOString().slice(0, 10);
  return {
    cycle,
    rallyCount: rallies.length,
    bytes: buildStyledXlsx(sheets),
    title: `K710 Rally Teams - ${event.name} ${cycleLabel} - ${date}`,
    fileName: `k710-rally-teams-${type}-${date}.xlsx`,
  };
}

export async function rememberRallySheet(cycleId, fileId) {
  if (!cycleId || !ObjectId.isValid(cycleId)) return;
  const coll = await getCollection(COLLECTIONS.EVENT_CYCLES);
  await coll.updateOne({ _id: new ObjectId(cycleId) }, { $set: { rally_sheet_id: String(fileId) } });
}

export async function savedRallySheetId(cycleId) {
  if (!cycleId || !ObjectId.isValid(cycleId)) return '';
  const coll = await getCollection(COLLECTIONS.EVENT_CYCLES);
  const row = await coll.findOne({ _id: new ObjectId(cycleId) });
  return row?.rally_sheet_id ? String(row.rally_sheet_id) : '';
}
