'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AdminShell from './AdminShell';
import AdminDialog from './AdminDialog';
import { resultKindForEvent, closeFormsWarning, publishFormClosedWarning } from '../../lib/resultVisibility.mjs';
import EventForms from './EventForms';
import RosterWorkspace from './RosterWorkspace';
import StartCycleDialog, { suggestNextLabel } from './StartCycleDialog';
import StatusChip from './StatusChip';
import { AdminEmbedContext } from './adminEmbed';
import { ACTION_LABELS, fetchEventState, runEventAction } from './eventControlClient';
import { formatLocal } from './adminDates';
import { formatUtc } from '../../lib/deadlines.mjs';
import { Button } from '../ui';
import AppointmentsFlow from '../../app/admin/dashboard/kvk-appointments/AppointmentsFlow';
import NobleAppointmentsFlow from '../../app/admin/dashboard/prep-ministers/NobleAppointmentsFlow';

const EVENTS = {
  kvk: {
    name: 'KvK',
    fallbackLabel: 'KvK Season',
    roster: {
      title: 'KvK participants',
      membersEndpoint: '/api/admin-submissions',
      ralliesEndpoint: '/api/admin-rallies',
      rallyStorageKey: 'kvk-admin-rallies-v1',
      exportFileNamePrefix: 'k710-kvk-participants',
      workbookSheetName: 'KvK Participants',
      allowClearTestData: true,
      cycleType: 'kvk',
    },
    tabs: [
      { id: 'participants', label: 'Participants' },
      { id: 'rallies', label: 'Rallies' },
      { id: 'appointments', label: 'Appointments' },
      { id: 'history', label: 'History' },
    ],
  },
  flamedragon: {
    name: 'Flamedragon Tyrant',
    fallbackLabel: 'Flamedragon Tyrant',
    roster: {
      title: 'Tyrant participants',
      membersEndpoint: '/api/admin-flamedragon',
      ralliesEndpoint: '/api/admin-flamedragon-rallies',
      rallyStorageKey: 'flamedragon-admin-rallies-v1',
      exportFileNamePrefix: 'k710-tyrant-participants',
      workbookSheetName: 'Tyrant Participants',
      allowClearTestData: false,
      cycleType: 'flamedragon',
    },
    tabs: [
      { id: 'participants', label: 'Participants' },
      { id: 'rallies', label: 'Rallies' },
      { id: 'noble', label: 'Noble advisor schedule' },
      { id: 'history', label: 'History' },
    ],
  },
};

const STATUS = {
  collecting: { kind: 'open', text: 'Collecting answers' },
  closed: { kind: 'closed', text: 'Forms closed' },
  published: { kind: 'published', text: 'Schedule published' },
  ended: { kind: 'ended', text: 'Ended' },
};

// Actions that need a "are you sure" step, with what will happen.
function confirmCopy(action, state, eventName) {
  const c = state?.counts || {};
  const label = state?.cycle?.label || `this ${eventName} cycle`;
  switch (action) {
    case 'close_forms':
      return {
        title: `Close all forms for ${label}?`,
        confirm: 'Close forms',
        danger: true,
        body: [
          `${c.forms_open ?? 0} of ${c.forms_total ?? 0} forms will close. Members will see the closed message instead of the form.`,
          `${c.applicants ?? 0} applicants keep their answers. You can open the forms again at any time.`,
        ],
      };
    case 'publish':
      return {
        title: 'Publish the schedule?',
        confirm: 'Publish schedule',
        danger: false,
        body: [
          `${state?.appointments?.slots_booked ?? 0} appointment slots for ${state?.appointments?.people_booked ?? 0} people are ready (${state?.appointments?.prep_answers ?? 0} Prep & Appointments answers this cycle).`,
          'Members can see the published schedule straight away.',
        ],
      };
    case 'unpublish':
      return {
        title: 'Unpublish the schedule?',
        confirm: 'Unpublish',
        danger: false,
        body: ['Members will no longer see the schedule. Your assignments are kept.'],
      };
    case 'archive_reset':
      return {
        title: `End ${label} without starting a new cycle?`,
        confirm: 'End this cycle',
        danger: true,
        body: [
          `All forms close and ${label} moves to History with its ${c.applicants ?? 0} applicants. Nothing is deleted.`,
          'Members will see closed forms until you use Start next cycle. If you want a new cycle straight away, use Start next cycle instead; it ends this one for you.',
        ],
      };
    default:
      return null;
  }
}

function dateRange(cycle) {
  if (!cycle || (!cycle.start_date && !cycle.end_date)) return null;
  const part = (iso) => {
    const utc = formatUtc(iso);
    const local = formatLocal(iso);
    return utc ? `${utc}${local ? ` / ${local} local` : ''}` : '';
  };
  const out = [];
  if (cycle.start_date) out.push(`Starts ${part(cycle.start_date)}`);
  if (cycle.end_date) out.push(`Ends ${part(cycle.end_date)}`);
  return out;
}

export default function EventControl({ type }) {
  const config = EVENTS[type] || EVENTS.kvk;
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [tab, setTab] = useState('participants');
  const [cycleFilter, setCycleFilter] = useState('current');
  const tabRefs = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setState(await fetchEventState(type));
    } catch (err) {
      setLoadError(err.message || 'Could not load this event.');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let wanted = new URLSearchParams(window.location.search).get('tab');
    if (wanted === 'prep') wanted = 'appointments'; // old "Prep ministers" tab links
    if (wanted && config.tabs.some((t) => t.id === wanted)) setTab(wanted);
  }, [config]);

  function selectTab(id) {
    setTab(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', id);
      window.history.replaceState(null, '', url);
    } catch { /* ignore */ }
  }

  function onTabKey(event, index) {
    const last = config.tabs.length - 1;
    let next = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    const id = config.tabs[next].id;
    selectTab(id);
    tabRefs.current[id]?.focus();
  }

  async function perform(action, payload = {}, successText = '') {
    setBusyAction(action);
    setActionError('');
    setNotice('');
    try {
      const next = await runEventAction(type, action, payload);
      setState(next);
      setNotice(successText || `${ACTION_LABELS[action] || 'Change'} done.`);
      window.dispatchEvent(new Event('admin-tasks-changed'));
      return next;
    } finally {
      setBusyAction('');
    }
  }

  async function runWithErrors(action, payload, successText) {
    try {
      await perform(action, payload, successText);
      return true;
    } catch (err) {
      setActionError(err.message || 'That did not work. Nothing was changed.');
      return false;
    }
  }

  function requestAction(action) {
    if (action === 'start_cycle') {
      setWizardOpen(true);
      return;
    }
    if (confirmCopy(action, state, config.name)) {
      setConfirm({ action });
      return;
    }
    const text = { open_forms: 'Forms are open.' }[action];
    runWithErrors(action, {}, text);
  }

  async function confirmAction() {
    const { action, form } = confirm;
    const payload = action === 'archive_reset' ? { confirm: true } : form ? { form_key: form.form_key } : {};
    const text = {
      close_forms: form ? `${form.label} is closed.` : 'Forms are closed.',
      publish: 'Schedule published.',
      unpublish: 'Schedule unpublished.',
      archive_reset: 'Cycle ended and moved to History.',
    }[action];
    const ok = await runWithErrors(action, payload, text);
    if (ok) {
      setConfirm(null);
      if (action === 'archive_reset') setCycleFilter('current');
    } else {
      setConfirm(null);
    }
  }

  async function startCycle(payload) {
    await perform('start_cycle', payload, `Started ${payload.label}.`);
    setWizardOpen(false);
    setCycleFilter('current');
  }

  function toggleForm(form, nextOpen) {
    if (nextOpen) {
      runWithErrors('open_forms', { form_key: form.form_key }, `${form.label} is open.`);
    } else {
      setConfirm({ action: 'close_forms', form });
    }
  }

  async function saveWindow(form, window_) {
    await perform('set_window', { form_key: form.form_key, ...window_ }, `${form.label} times saved.`);
  }

  const cycle = state?.cycle || null;
  const nextActions = state?.next_actions || [];
  const primary = nextActions[0] || null;
  const others = nextActions.slice(1);
  const status = cycle ? STATUS[cycle.status] || { kind: 'none', text: cycle.status } : { kind: 'none', text: 'No active cycle' };
  const ranges = dateRange(cycle);
  const history = state?.history || [];
  const counts = state?.counts;
  const isDanger = (action) => action === 'close_forms' || action === 'archive_reset';

  const copy = confirm ? confirmCopy(confirm.action, state, config.name) : null;
  const confirmCopyFinal = confirm && confirm.form
    ? {
        title: `Close ${confirm.form.label}?`,
        confirm: 'Close form',
        danger: true,
        body: ['Members will see the closed message instead of this form. Answers already sent are kept. You can open it again at any time.'],
      }
    : copy;
  // Owner rule: My appointment is hidden from members while its form is closed.
  const resultKind = resultKindForEvent(type);
  const ownerOpen = (key) => (state?.forms || []).some((f) => f.form_key === key && f.is_open);
  const publishWarn = confirm && confirm.action === 'publish' && resultKind
    ? publishFormClosedWarning(resultKind, ownerOpen(resultKind === 'kvk' ? 'prep' : 'noble'))
    : null;
  const closeWarn = confirm && confirm.action === 'close_forms' && confirmCopyFinal && resultKind
    ? closeFormsWarning(resultKind, {
      formKey: confirm.form?.form_key || '',
      published: state?.results_published === true,
      formOpen: ownerOpen(resultKind === 'kvk' ? 'prep' : 'noble'),
    })
    : null;

  const pastFilter = cycleFilter !== 'current' ? history.find((h) => h.id === cycleFilter) : null;
  const inRoster = tab === 'participants' || tab === 'rallies';

  const actions = state ? (
    <div className="ec-actions">
      {primary ? (
        <Button
          className={isDanger(primary) ? 'ec-btn-danger' : ''}
          onClick={() => requestAction(primary)}
          disabled={Boolean(busyAction)}
        >
          {busyAction === primary ? 'Working...' : ACTION_LABELS[primary] || primary}
        </Button>
      ) : null}
      {others.length > 0 ? (
        <details className="roster-more ec-more">
          <summary>More actions</summary>
          <div className="roster-more-menu">
            {others.map((action) => (
              <button
                key={action}
                type="button"
                className={isDanger(action) ? 'roster-more-danger' : ''}
                onClick={(e) => {
                  e.currentTarget.closest('details')?.removeAttribute('open');
                  requestAction(action);
                }}
                disabled={Boolean(busyAction)}
              >
                {ACTION_LABELS[action] || action}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  ) : null;

  const meta = (
    <div className="ec-meta">
      {loading && !state ? (
        <span className="ec-meta-loading">Loading cycle...</span>
      ) : state ? (
        <>
          <strong className="ec-cycle-name">{cycle ? cycle.label : 'No cycle yet'}</strong>
          <StatusChip kind={status.kind}>{status.text}</StatusChip>
          {ranges && ranges.length ? <span className="ec-dates">{ranges.join(' · ')}</span> : null}
        </>
      ) : null}
    </div>
  );

  return (
    <AdminShell title={config.name} meta={meta} actions={actions}>
      <div className="ec-page">
        <div className="ec-live" role="status" aria-live="polite">{notice ? <p className="ec-notice">{'✓ '}{notice}</p> : null}</div>
        {actionError ? (
          <p className="ec-inline-error" role="alert">
            {actionError} <button type="button" className="ec-link-btn" onClick={() => setActionError('')}>Dismiss</button>
          </p>
        ) : null}
        {loadError ? (
          <div className="ec-error-card" role="alert">
            <p><strong>Cycle controls could not load.</strong> {loadError}</p>
            <Button variant="quiet" onClick={load}>Try again</Button>
          </div>
        ) : null}

        {state ? (
          <>
            <dl className="ec-stats" aria-label={`${config.name} summary`}>
              <div><dt>Applicants</dt><dd>{counts?.applicants ?? 0}</dd></div>
              <div><dt>Assigned</dt><dd>{counts?.assigned ?? 0}</dd></div>
              <div className={counts?.unassigned > 0 ? 'is-attn' : ''}><dt>Unassigned</dt><dd>{counts?.unassigned ?? 0}</dd></div>
              <div><dt>Forms open</dt><dd>{counts?.forms_open ?? 0}<span> of {counts?.forms_total ?? 0}</span></dd></div>
            </dl>

            <section className="ec-section" aria-labelledby="ec-forms-h">
              <h2 id="ec-forms-h" className="ec-h2">Forms</h2>
              <EventForms forms={state.forms || []} onSaveWindow={saveWindow} onToggle={toggleForm} />
            </section>
          </>
        ) : loading ? (
          <div className="ec-skeleton" aria-hidden="true"><span /><span /><span /><span /></div>
        ) : null}

        <div className="admin-tabs ec-tabs" role="tablist" aria-label={`${config.name} sections`}>
          {config.tabs.map((t, index) => (
            <button
              key={t.id}
              ref={(node) => { tabRefs.current[t.id] = node; }}
              type="button"
              role="tab"
              id={`ec-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`ec-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`admin-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => selectTab(t.id)}
              onKeyDown={(e) => onTabKey(e, index)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`ec-panel-${inRoster ? tab : 'participants'}`}
          aria-labelledby={`ec-tab-${inRoster ? tab : 'participants'}`}
          hidden={!inRoster}
        >
          {pastFilter ? (
            <div className="ec-past-banner" role="status">
              <span>Showing past cycle <strong>{pastFilter.label}</strong>. Exports cover this cycle only.</span>
              <button type="button" className="ec-link-btn" onClick={() => setCycleFilter('current')}>Back to current cycle</button>
            </div>
          ) : null}
          <AdminEmbedContext.Provider value>
            <RosterWorkspace
              key={`${cycle?.id || 'none'}`}
              {...config.roster}
              view={tab === 'rallies' ? 'rallies' : 'participants'}
              cycleFilter={cycleFilter}
            />
          </AdminEmbedContext.Provider>
        </div>

        {tab === 'appointments' && type === 'kvk' ? (
          <div role="tabpanel" id="ec-panel-appointments" aria-labelledby="ec-tab-appointments">
            <AdminEmbedContext.Provider value><AppointmentsFlow onChanged={load} /></AdminEmbedContext.Provider>
          </div>
        ) : null}
        {tab === 'noble' && type === 'flamedragon' ? (
          <div role="tabpanel" id="ec-panel-noble" aria-labelledby="ec-tab-noble">
            <AdminEmbedContext.Provider value><NobleAppointmentsFlow /></AdminEmbedContext.Provider>
          </div>
        ) : null}

        {tab === 'history' ? (
          <div role="tabpanel" id="ec-panel-history" aria-labelledby="ec-tab-history">
            {history.length === 0 ? (
              <p className="ec-empty">{loading ? 'Loading...' : 'No cycles recorded yet.'}</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table ec-history">
                  <thead>
                    <tr>
                      <th scope="col">Cycle</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="ec-num">Applicants</th>
                      <th scope="col">Answers per form</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <th scope="row" data-label="Cycle">{h.label}{h.start_date ? <span className="ec-hist-date"> {formatUtc(h.start_date)}</span> : null}</th>
                        <td data-label="Status">
                          {h.is_current ? <StatusChip kind="open">Current</StatusChip> : h.archived ? <StatusChip kind="ended">Archived</StatusChip> : <StatusChip kind="closed">Past</StatusChip>}
                        </td>
                        <td data-label="Applicants" className="ec-num">{h.applicants}</td>
                        <td data-label="Answers per form">
                          {Object.entries(h.forms_submitted || {}).length
                            ? Object.entries(h.forms_submitted).map(([key, n]) => `${(state?.forms || []).find((f) => f.form_key === key)?.label || key}: ${n}`).join(' · ')
                            : '-'}
                        </td>
                        <td data-label="Actions">
                          <Button
                            variant="quiet"
                            className="ec-btn-sm"
                            onClick={() => {
                              setCycleFilter(h.is_current ? 'current' : h.id);
                              selectTab('participants');
                            }}
                          >
                            View &amp; export
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <AdminDialog
        open={Boolean(confirm && confirmCopyFinal)}
        title={confirmCopyFinal?.title || ''}
        onClose={() => setConfirm(null)}
        busy={Boolean(busyAction)}
        role="alertdialog"
        footer={(
          <>
            <Button variant="quiet" onClick={() => setConfirm(null)} disabled={Boolean(busyAction)}>Cancel</Button>
            <Button
              className={confirmCopyFinal?.danger ? 'ec-btn-danger' : ''}
              onClick={confirmAction}
              disabled={Boolean(busyAction)}
            >
              {busyAction ? 'Working...' : confirmCopyFinal?.confirm}
            </Button>
          </>
        )}
      >
        {confirmCopyFinal?.body.map((line) => <p key={line} className="ec-confirm-line">{line}</p>)}
        {publishWarn && <p className="ec-confirm-line" role="alert"><strong>{publishWarn}</strong> Use the Forms list below to open it.</p>}
        {closeWarn && <p className="ec-confirm-line" role="alert"><strong>{closeWarn}</strong></p>}
      </AdminDialog>

      <StartCycleDialog
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSubmit={startCycle}
        suggestion={suggestNextLabel(history, cycle, config.fallbackLabel)}
        hasPrevious={Boolean(cycle)}
        eventName={config.name}
      />
    </AdminShell>
  );
}
