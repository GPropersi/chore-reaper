import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ApiResponse, NotificationStatus, SwipeStyle } from '@customTypes/SharedTypes';
import { apiFetch } from '../../utils/api';

type SwipeStyleOption = {
  value: SwipeStyle;
  label: string;
  description: string;
};

const SWIPE_STYLE_OPTIONS: SwipeStyleOption[] = [
  {
    value: 'ios',
    label: 'iOS',
    description: 'Swipe left to reveal edit and delete buttons, then tap one to confirm.',
  },
  {
    value: 'android',
    label: 'Android',
    description: 'Swipe right to delete, swipe left to edit — no separate tap to confirm.',
  },
];

const DEFAULT_STATUS: NotificationStatus = { provisioned: false, enabled: false };

// ntfy app install links — real store/web destinations (native keyboard-operable
// anchors, DD-10).
const NTFY_APP_STORE_URL = 'https://apps.apple.com/app/ntfy/id1625396347';
const NTFY_GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=io.heckel.ntfy';
const NTFY_WEB_URL = 'https://ntfy.sh/app';

type TestMessage = { kind: 'ok' | 'err'; text: string };

type SettingsModalProps = {
  swipeStyle: SwipeStyle;
  onSwipeStyleChange: (swipeStyle: SwipeStyle) => void;
  onCancel: () => void;
};

export default function SettingsModal({ swipeStyle, onSwipeStyleChange, onCancel }: SettingsModalProps) {
  const [error, setError] = useState<string | null>(null);

  // Notifications section — self-contained local state (the modal is only mounted
  // while open, so this is isolated from useMe()).
  const [status, setStatus] = useState<NotificationStatus>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<TestMessage | null>(null);
  const [actionPending, setActionPending] = useState(false); // shared Send-test/Disable guard (DD-6)
  const [enabling, setEnabling] = useState(false); // dedicated enable-in-flight flag (DD-21)
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const toggleRef = useRef<HTMLInputElement>(null);
  const prevEnabled = useRef(status.enabled);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount fetch of the current notification status (DD-8): a thrown/rejected call
  // sets the error and leaves status at its default off state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/notifications');
        const body = (await res.json()) as ApiResponse<NotificationStatus>;
        if (cancelled) return;
        if (body.success && body.data) {
          setStatus(body.data);
        } else {
          setNotifError(body.error ?? 'Could not load notification settings');
        }
      } catch {
        if (!cancelled) setNotifError('Could not load notification settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Return focus to the toggle after the enabled → disabled transition commits
  // (DD-22/DD-A) — an effect, not an inline post-setStatus focus(), so it runs
  // after React has removed the enabled-body panel.
  useEffect(() => {
    if (prevEnabled.current && !status.enabled) {
      toggleRef.current?.focus();
    }
    prevEnabled.current = status.enabled;
  }, [status.enabled]);

  // Clear any pending "Copied!" revert timer on unmount.
  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  async function handleSelect(value: SwipeStyle) {
    if (value === swipeStyle) return;
    setError(null);
    const res = await apiFetch('/api/me/swipe-style', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ swipeStyle: value }),
    });
    const body = (await res.json()) as ApiResponse<{ swipeStyle: SwipeStyle }>;
    if (body.success && body.data) {
      onSwipeStyleChange(body.data.swipeStyle);
    } else {
      setError(body.error ?? 'Could not update swipe style');
    }
  }

  // The toggle is a status indicator once enabled (DD-5) and locked while enabling
  // (DD-21) or before the mount fetch resolves; it uses aria-disabled (not native
  // `disabled`, DD-D) so keyboard focus survives the transitions.
  const toggleChecked = enabling || status.enabled;
  const toggleDisabled = loading || enabling || status.enabled;

  function handleToggleChange() {
    // Guarded no-op (DD-D): never start an enable while aria-disabled.
    if (toggleDisabled) return;
    void handleEnable();
  }

  async function handleEnable() {
    setEnabling(true);
    setNotifError(null);
    try {
      const res = await apiFetch('/api/notifications/enable', { method: 'POST' });
      const body = (await res.json()) as ApiResponse<NotificationStatus>;
      if (body.success && body.data) {
        setStatus(body.data); // DD-C — render the enabled body straight off the response
      } else {
        setNotifError(body.error ?? 'Could not set up notifications');
      }
    } catch {
      setNotifError('Could not set up notifications');
    } finally {
      setEnabling(false); // DD-21 — always clear; on failure status stays off, reverting the toggle
    }
  }

  async function handleTest() {
    setTestMsg(null); // DD-7 — clear any stale message synchronously before the request
    setActionPending(true);
    try {
      const res = await apiFetch('/api/notifications/test', { method: 'POST' });
      const body = (await res.json()) as ApiResponse<null>;
      // Check body.success ALONE — /test's success payload is { success: true,
      // data: null }, so a `&& body.data` guard would misread every send as failed.
      if (body.success) {
        setTestMsg({ kind: 'ok', text: 'Test notification sent — check your phone.' });
      } else {
        setTestMsg({ kind: 'err', text: body.error ?? 'Could not send test notification' });
      }
    } catch {
      setTestMsg({ kind: 'err', text: 'Could not send test notification' });
    } finally {
      setActionPending(false);
    }
  }

  async function handleDisable() {
    setActionPending(true);
    setNotifError(null);
    try {
      const res = await apiFetch('/api/notifications/disable', { method: 'POST' });
      const body = (await res.json()) as ApiResponse<NotificationStatus>;
      if (body.success && body.data) {
        setStatus(body.data); // DD-C — collapse back to the off state with no re-fetch
        setTestMsg(null);
      } else {
        setNotifError(body.error ?? 'Could not disable notifications');
      }
    } catch {
      setNotifError('Could not disable notifications');
    } finally {
      setActionPending(false);
    }
  }

  function handleCopy() {
    setCopyError(false); // clear any prior failure note on the next attempt (DD-E)
    navigator.clipboard
      .writeText(status.subscriberToken ?? '')
      .then(() => {
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 2000); // DD-11 — ~2s revert
      })
      .catch(() => {
        // DD-E — clipboard denied/insecure context: don't claim success; the token
        // is still visible above for manual selection.
        setCopied(false);
        setCopyError(true);
      });
  }

  const subscribeUrl = `${status.server}/${status.topic}`;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 px-4 pt-4"
      onClick={handleBackdropClick}
      data-testid="settings-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md overflow-y-auto max-h-[90dvh]">
        <h3 id="settings-modal-title" className="text-white font-semibold text-lg mb-4">
          Settings
        </h3>
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Chore swipe style</p>
        <ul className="space-y-2" data-testid="swipe-style-list">
          {SWIPE_STYLE_OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => handleSelect(option.value)}
                aria-current={option.value === swipeStyle}
                className={`w-full text-left px-3 py-2 rounded-lg ${
                  option.value === swipeStyle
                    ? 'bg-indigo-900/50 text-indigo-300'
                    : 'text-white hover:bg-gray-700'
                }`}
              >
                <div className="text-sm font-medium">{option.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{option.description}</div>
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <div className="mt-5 pt-5 border-t border-gray-700">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Notifications</p>
          {!status.enabled && (
            <p className="text-gray-400 text-sm mb-3 leading-relaxed">
              Get push reminders on your phone via the ntfy app. Off by default — turn it on to set up.
            </p>
          )}

          <label className="flex items-center gap-2.5 min-h-[44px] text-gray-300 text-sm cursor-pointer">
            <input
              ref={toggleRef}
              type="checkbox"
              className="w-[18px] h-[18px] rounded accent-indigo-600"
              checked={toggleChecked}
              aria-disabled={toggleDisabled}
              onChange={handleToggleChange}
            />
            {status.enabled ? 'Push notifications enabled' : 'Enable push notifications'}
          </label>

          {enabling && (
            <p role="status" className="text-gray-400 text-sm mt-2.5">
              Setting up your notifications…
            </p>
          )}

          {status.enabled && (
            <div className="mt-3.5">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-wrap gap-4 items-center">
                <div className="w-48 h-48 shrink-0 bg-white rounded-md p-2 flex items-center justify-center">
                  <QRCodeSVG
                    value={subscribeUrl}
                    size={176}
                    marginSize={0}
                    title="Scan to subscribe to notifications in the ntfy app"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Server</div>
                  <div className="text-xs text-gray-200 font-mono break-all mb-2.5">{status.server}</div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Topic</div>
                  <div className="text-xs text-gray-200 font-mono break-all mb-2.5">{status.topic}</div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Access token</div>
                  <div className="text-xs text-gray-200 font-mono break-all mb-1.5">
                    {status.subscriberToken}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-indigo-400 text-[13px] underline min-h-[44px] inline-flex items-center"
                  >
                    {copied ? 'Copied!' : 'Copy token'}
                  </button>
                  {copyError && (
                    <p role="alert" className="text-red-400 text-xs mt-1">
                      Couldn’t copy — select the token above.
                    </p>
                  )}
                </div>
              </div>

              <ol className="list-decimal pl-[18px] text-xs text-gray-400 leading-relaxed mt-3.5 mb-1 space-y-1">
                <li>
                  Install the <strong>ntfy</strong> app.
                </li>
                <li>
                  Add server <span className="font-mono">{status.server}</span> with the access token above
                  (manual entry).
                </li>
                <li>
                  Subscribe to topic <span className="font-mono">{status.topic}</span>, or scan the QR above.
                </li>
              </ol>

              <div className="flex flex-wrap gap-2.5 my-2">
                <a
                  href={NTFY_APP_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 text-[13px] underline min-h-[44px] inline-flex items-center"
                >
                  App Store ↗
                </a>
                <a
                  href={NTFY_GOOGLE_PLAY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 text-[13px] underline min-h-[44px] inline-flex items-center"
                >
                  Google Play ↗
                </a>
                <a
                  href={NTFY_WEB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 text-[13px] underline min-h-[44px] inline-flex items-center"
                >
                  ntfy web ↗
                </a>
              </div>

              <div className="flex gap-2.5 mt-4">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={actionPending}
                  className="flex-1 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg"
                >
                  Send test notification
                </button>
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={actionPending}
                  className="flex-1 min-h-[44px] bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg"
                >
                  Disable
                </button>
              </div>

              {testMsg && (
                <p
                  role={testMsg.kind === 'ok' ? 'status' : 'alert'}
                  className={`text-sm mt-3 ${testMsg.kind === 'ok' ? 'text-green-400' : 'text-red-400'}`}
                >
                  {testMsg.text}
                </p>
              )}
            </div>
          )}

          {notifError && (
            <p role="alert" className="text-red-400 text-sm mt-3">
              {notifError}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-full mt-4 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg"
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  );
}
