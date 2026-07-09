import { createPortal } from 'react-dom';
import { useState } from 'react';
import type { SwipeStyle } from '@customTypes/SharedTypes';
import { apiFetch } from '../../utils/api';

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

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

type SettingsModalProps = {
  swipeStyle: SwipeStyle;
  onSwipeStyleChange: (swipeStyle: SwipeStyle) => void;
  onCancel: () => void;
};

export default function SettingsModal({ swipeStyle, onSwipeStyleChange, onCancel }: SettingsModalProps) {
  const [error, setError] = useState<string | null>(null);

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

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 px-4 pt-4"
      onClick={handleBackdropClick}
      data-testid="settings-modal-backdrop"
    >
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md overflow-y-auto max-h-[90dvh]">
        <h3 className="text-white font-semibold text-lg mb-4">Settings</h3>
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
