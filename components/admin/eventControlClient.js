// Thin client for /api/admin-event-control. Every call resolves to the GET
// state shape or throws an Error whose message is safe to show inline.

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function fail(response, body) {
  if (body && body.error) return new Error(body.error);
  if (response.status === 404) return new Error('The event control service is not available yet (404). Reload in a moment.');
  if (response.status === 401) return new Error('Your admin session expired. Log in again.');
  return new Error(`Request failed (${response.status}).`);
}

export async function fetchEventState(type) {
  const response = await fetch(`/api/admin-event-control?type=${encodeURIComponent(type)}`, { cache: 'no-store' });
  const body = await readJson(response);
  if (!response.ok || !body || body.error) throw fail(response, body);
  return body;
}

export async function runEventAction(type, action, payload = {}) {
  const response = await fetch('/api/admin-event-control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, action, ...payload }),
  });
  const body = await readJson(response);
  if (!response.ok || !body || body.error || !body.state) throw fail(response, body);
  return body.state;
}

// Plain-language label for each next_actions value.
export const ACTION_LABELS = {
  start_cycle: 'Start next cycle',
  close_forms: 'Close forms',
  open_forms: 'Open forms',
  publish: 'Publish schedule',
  unpublish: 'Unpublish schedule',
  archive_reset: 'Archive & start fresh',
};

export const DESTRUCTIVE_ACTIONS = ['close_forms', 'publish', 'unpublish', 'archive_reset'];
