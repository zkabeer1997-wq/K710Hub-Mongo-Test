import { ObjectId } from 'mongodb';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { KVK_FORM_KEYS, FLAMEDRAGON_FORM_KEYS } from './formGates.mjs';
import { getFormGates } from './formGates.server.js';
import { parseGateWindow } from './formGateWindow.mjs';
import { windowState, toMs } from './deadlines.mjs';
import {
  EVENT_CYCLE_TYPES,
  RALLY_COLLECTION_BY_TYPE,
  createEventCycle,
  currentRallyScope,
  cycleMemberIds,
  getCurrentEventCycle,
  listEventCycles,
  retireEventCycle,
} from './eventCycles.server.js';

// One place that runs a KvK or Flamedragon Tyrant cycle: the cycle record, the forms
// attached to it, the appointments schedule and the planner. Driven by
// /api/admin-event-control.

const CONFIG = {
  kvk: {
    title: 'KvK',
    formKeys: KVK_FORM_KEYS,
    labels: { lead: 'Power Profile', joiner: 'KvK Availability', prep: 'KvK Prep', appointments: 'KvK Appointments' },
    roster: COLLECTIONS.SUBMISSIONS,
  },
  flamedragon: {
    title: 'Flamedragon Tyrant',
    formKeys: FLAMEDRAGON_FORM_KEYS,
    labels: { dragon: 'Flamedragon Tyrant form', noble: 'Noble Advisor schedule' },
    roster: COLLECTIONS.FLAMEDRAGON_FORMS,
  },
};

const EDIT_HREF = {
  appointments: '/admin/dashboard/kvk-appointments',
  noble: '/admin/dashboard/noble-advisor',
  dragon: '/admin/dashboard/flamedragon',
};
const DEFAULT_EDIT_HREF = '/admin/dashboard/form-gates';

export class ControlError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const iso = (value) => {
  const ms = toMs(value);
  return ms === null ? null : new Date(ms).toISOString();
};

export function isControlType(type) {
  return EVENT_CYCLE_TYPES.includes(type);
}

async function isPublished(cycleId) {
  const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_CYCLES);
  const row = await coll.findOne({ cycle_id: cycleId });
  return row?.published === true;
}

/** Full control state for one cycle type (the GET shape and the POST response). */
export async function getEventControlState(type, now = Date.now()) {
  const cfg = CONFIG[type];
  const cycle = await getCurrentEventCycle(type);
  const gates = await getFormGates();

  const forms = cfg.formKeys.map((key) => {
    const gate = gates[key];
    const win = windowState(gate, now);
    const state = !cycle ? 'ended' : win.state;
    return {
      form_key: key,
      label: cfg.labels[key],
      state,
      is_open: state === 'open',
      opens_at: iso(gate.opens_at),
      closes_at: iso(gate.closes_at),
      message: gate.message || '',
      edit_href: EDIT_HREF[key] || DEFAULT_EDIT_HREF,
    };
  });
  const formsOpen = forms.filter((f) => f.is_open).length;

  let appointments = null;
  let published = false;
  if (type === 'kvk') {
    const cycleId = gates.appointments.cycle_id;
    published = await isPublished(cycleId);
    appointments = { published, cycle_id: cycleId };
  }

  let counts = { applicants: 0, assigned: 0, unassigned: 0, forms_open: formsOpen, forms_total: forms.length };
  if (cycle) {
    const applicantIds = await cycleMemberIds(type, cycle.id);
    const scope = await currentRallyScope(type);
    const rallies = await getCollection(RALLY_COLLECTION_BY_TYPE[type]);
    const rows = await rallies.find(scope.filter).toArray();
    const assignedIds = new Set(rows.flatMap((r) => (Array.isArray(r.member_ids) ? r.member_ids.map(String) : [])));
    const assigned = [...applicantIds].filter((id) => assignedIds.has(id)).length;
    counts = { applicants: applicantIds.size, assigned, unassigned: applicantIds.size - assigned, forms_open: formsOpen, forms_total: forms.length };
  }

  let status = null;
  if (cycle) {
    if (cycle.archived || cycle.is_current === false) status = 'ended';
    else if (published) status = 'published';
    else status = formsOpen > 0 ? 'collecting' : 'closed';
  }

  const history = [];
  for (const past of await listEventCycles(type)) {
    if (cycle && past.id === cycle.id) continue;
    history.push({
      id: past.id,
      label: past.label,
      archived: past.archived === true,
      is_current: past.is_current === true,
      applicants: (await cycleMemberIds(type, past.id)).size,
    });
  }

  let nextActions = ['start_cycle'];
  if (cycle) {
    const toggle = formsOpen > 0 ? 'close_forms' : 'open_forms';
    if (status === 'collecting') {
      nextActions = ['close_forms', ...(type === 'kvk' ? ['publish'] : []), 'start_cycle', 'archive_reset'];
    } else if (status === 'published') {
      nextActions = ['archive_reset', 'unpublish', toggle, 'start_cycle'];
    } else {
      nextActions = type === 'kvk'
        ? ['publish', 'archive_reset', 'open_forms', 'start_cycle']
        : ['archive_reset', 'open_forms', 'start_cycle'];
    }
  }

  return {
    type,
    title: cfg.title,
    cycle: cycle
      ? { id: cycle.id, label: cycle.label, start_date: cycle.start_date || null, end_date: cycle.end_date || null, status }
      : null,
    counts,
    forms,
    appointments,
    history,
    next_actions: nextActions,
  };
}

async function setGateFields(formKey, fields) {
  const coll = await getCollection(COLLECTIONS.FORM_GATES);
  await coll.updateOne({ form_key: formKey }, { $set: { form_key: formKey, ...fields, updated_at: new Date() } }, { upsert: true });
}

function pickKeys(cfg, body) {
  if (body.form_key === undefined || body.form_key === null || body.form_key === '') return cfg.formKeys;
  const key = String(body.form_key);
  if (!cfg.formKeys.includes(key)) throw new ControlError('That form does not belong to this event.');
  return [key];
}

function validDateOrNull(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(text) || toMs(text) === null) throw new ControlError(`${name} is not a valid date.`);
  return text;
}

/**
 * Run one control action. Throws ControlError (4xx) for bad input; returns nothing,
 * callers re-read state with getEventControlState.
 */
export async function runEventControlAction(type, action, body = {}, now = Date.now()) {
  const cfg = CONFIG[type];
  if (!cfg) throw new ControlError('Unknown cycle type.');

  switch (action) {
    case 'start_cycle': {
      const label = String(body.label || '').trim();
      if (!label || label.length > 80) throw new ControlError('Cycle name is required and must be 80 characters or fewer.');
      const startDate = validDateOrNull(body.start_date, 'Start date');
      const endDate = validDateOrNull(body.end_date, 'End date');
      if (startDate && endDate && toMs(endDate) < toMs(startDate)) throw new ControlError('End date must not be before the start date.');
      const win = parseGateWindow({ opens_at: body.opens_at ?? null, closes_at: body.closes_at ?? null });
      if (win.error) throw new ControlError(win.error);

      const previous = await getCurrentEventCycle(type);
      const gates = await getFormGates();
      if (previous) {
        await retireEventCycle(previous);
      }
      const cycles = await getCollection(COLLECTIONS.EVENT_CYCLES);
      const created = await createEventCycle(type, { label, start_date: startDate, end_date: endDate, activate: true });
      if (previous && body.close_previous !== false) {
        await cycles.updateOne({ _id: new ObjectId(previous.id) }, { $set: { archived: true, is_current: false } });
      }
      for (const key of cfg.formKeys) {
        await setGateFields(key, {
          cycle_id: created.id,
          is_open: true,
          opens_at: win.fields.opens_at ?? null,
          closes_at: win.fields.closes_at ?? null,
          message: body.copy_settings === true ? gates[key]?.message || '' : '',
        });
      }
      if (type === 'kvk') {
        const pubs = await getCollection(COLLECTIONS.KVK_APPOINTMENT_CYCLES);
        await pubs.updateOne(
          { cycle_id: created.id },
          { $set: { published: false, published_at: null, updated_at: new Date() }, $setOnInsert: { cycle_id: created.id } },
          { upsert: true }
        );
      }
      return;
    }

    case 'close_forms':
      for (const key of pickKeys(cfg, body)) await setGateFields(key, { is_open: false });
      return;

    case 'open_forms': {
      // "Open" means open now: a window that has already ended (or not started) is cleared.
      const gates = await getFormGates();
      for (const key of pickKeys(cfg, body)) {
        const fields = { is_open: true };
        const opens = toMs(gates[key]?.opens_at);
        const closes = toMs(gates[key]?.closes_at);
        if (opens !== null && opens > now) fields.opens_at = null;
        if (closes !== null && closes <= now) fields.closes_at = null;
        await setGateFields(key, fields);
      }
      return;
    }

    case 'set_window': {
      const keys = pickKeys(cfg, { form_key: body.form_key });
      if (keys.length !== 1) throw new ControlError('Choose which form to schedule.');
      const key = keys[0];
      const coll = await getCollection(COLLECTIONS.FORM_GATES);
      const existing = await coll.findOne({ form_key: key });
      const input = {};
      if ('opens_at' in body) input.opens_at = body.opens_at;
      if ('closes_at' in body) input.closes_at = body.closes_at;
      const parsed = parseGateWindow(input, existing);
      if (parsed.error) throw new ControlError(parsed.error);
      const fields = { ...parsed.fields };
      if (body.message !== undefined) {
        const message = String(body.message || '');
        if (message.length > 500) throw new ControlError('The message must be 500 characters or fewer.');
        fields.message = message;
      }
      await setGateFields(key, fields);
      return;
    }

    case 'publish':
    case 'unpublish': {
      if (type !== 'kvk') throw new ControlError('Only KvK appointments can be published.');
      const gates = await getFormGates();
      const cycleId = gates.appointments.cycle_id;
      const publish = action === 'publish';
      const pubs = await getCollection(COLLECTIONS.KVK_APPOINTMENT_CYCLES);
      await pubs.updateOne(
        { cycle_id: cycleId },
        { $set: { published: publish, published_at: publish ? new Date() : null, updated_at: new Date() }, $setOnInsert: { cycle_id: cycleId } },
        { upsert: true }
      );
      return;
    }

    case 'archive_reset': {
      if (body.confirm !== true) throw new ControlError('Please confirm before archiving this cycle.');
      const cycle = await getCurrentEventCycle(type);
      if (!cycle) throw new ControlError('There is no active cycle to archive.');
      // Snapshots first: history must exist before the cycle stops being current.
      await retireEventCycle(cycle);
      const cycles = await getCollection(COLLECTIONS.EVENT_CYCLES);
      await cycles.updateOne({ _id: new ObjectId(cycle.id) }, { $set: { archived: true, is_current: false } });
      for (const key of cfg.formKeys) await setGateFields(key, { is_open: false });
      return;
    }

    default:
      throw new ControlError('Unknown action.');
  }
}
