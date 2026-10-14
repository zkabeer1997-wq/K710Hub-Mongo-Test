'use client';

import Switch from '../Switch';
import { Button, Callout, Tag } from '../../ui';
import { ago } from './giftApi';

/** Top of the Gift codes page: the automatic redeeming switch, runner state and the Process now / Resume button. */
export default function StatusBand({ overview, busy, onToggle, onRun }) {
  if (!overview) return null;
  const { config, runner, players, counters } = overview;
  const secretMissing = !config.secret_present;
  const running = runner.state === 'running';
  const canRun = !secretMissing && runner.auto_redeem_enabled && !running && !busy;
  const unfinished = counters.ready > 0;

  let stateText;
  if (running) {
    const p = runner.progress;
    stateText = p ? `Running now: code ${p.code}, ${p.remaining} player(s) left in this pass` : 'Running now';
  } else if (!runner.auto_redeem_enabled) {
    stateText = 'Idle. Automatic redeeming is switched off.';
  } else if (unfinished) {
    stateText = `Idle. ${counters.ready} redeem(s) are waiting for the next run.`;
  } else {
    stateText = 'Idle. Nothing waiting.';
  }

  return (
    <section className="gift-band" aria-label="Automatic redeeming status">
      {secretMissing ? (
        <Callout tone="warning" title="Automatic redeeming is not set up on this server">
          The signing secret is missing, so nothing can be redeemed. Add <code>GIFT_REDEEM_SIGN_SECRET</code> to the
          server settings (see docs/gift-redeem.md), restart, then turn the switch on here. Until then this page only
          stores codes and players.
        </Callout>
      ) : null}
      {runner.last_error ? (
        <Callout tone="danger" title="The last run stopped with an error">
          {runner.last_error}. It will try again on the next run.
        </Callout>
      ) : null}
      {config.endpoint_is_mock ? (
        <Callout tone="info">Test mode: requests go to a local test server, not to the game.</Callout>
      ) : null}

      <div className="gift-band-grid">
        <div className="gift-band-cell">
          <p className="gift-band-label">Automatic redeeming</p>
          <Switch
            checked={runner.auto_redeem_enabled}
            disabled={(secretMissing && !runner.auto_redeem_enabled) || Boolean(busy)}
            label="Redeem new gift codes automatically"
            onText="On"
            offText="Off"
            onChange={onToggle}
          />
          <p className="hint">
            {secretMissing
              ? 'Cannot be turned on until the signing secret is set.'
              : 'When on, every new active code is redeemed for the enrolled players below.'}
          </p>
        </div>
        <div className="gift-band-cell">
          <p className="gift-band-label">Runner</p>
          <p className="gift-band-value">
            <Tag tone={running ? 'accent' : 'neutral'}>{running ? 'Running' : 'Idle'}</Tag>
          </p>
          <p className="hint">{stateText}</p>
          <p className="hint">Last run: {runner.last_finished_at ? ago(runner.last_finished_at) : 'never'}</p>
        </div>
        <div className="gift-band-cell">
          <p className="gift-band-label">Players</p>
          <p className="gift-band-value">
            <strong>{players.runnable}</strong> will be redeemed for
          </p>
          <p className="hint">
            {players.disabled} paused · {players.failed} marked as failed by the game
          </p>
        </div>
        <div className="gift-band-cell gift-band-action">
          <Button disabled={!canRun} onClick={onRun}>
            {running ? 'Running…' : unfinished ? 'Resume processing' : 'Process now'}
          </Button>
          <p className="hint">
            {!runner.auto_redeem_enabled && !secretMissing ? 'Turn the switch on first.' : 'Starts the same run the schedule starts.'}
          </p>
        </div>
      </div>
    </section>
  );
}
