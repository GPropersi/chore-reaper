import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsModal from './SettingsModal';

function jsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('SettingsModal', () => {
  it('marks the currently active swipe style', () => {
    render(<SettingsModal swipeStyle="ios" onSwipeStyleChange={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole('button', { name: /iOS/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Android/ })).toHaveAttribute('aria-current', 'false');
  });

  it('selecting a different style PATCHes /api/me/swipe-style and reports the change', async () => {
    const user = userEvent.setup();
    const onSwipeStyleChange = vi.fn();
    let requestBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/me/swipe-style' && init?.method === 'PATCH') {
          requestBody = JSON.parse(init.body as string);
          return jsonResponse({ success: true, data: { swipeStyle: 'android' } });
        }
        throw new Error(`Unhandled fetch: ${init?.method} ${url}`);
      }),
    );

    render(<SettingsModal swipeStyle="ios" onSwipeStyleChange={onSwipeStyleChange} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Android/ }));

    expect(requestBody).toEqual({ swipeStyle: 'android' });
    expect(onSwipeStyleChange).toHaveBeenCalledWith('android');
  });

  it('shows an error and leaves the selection unchanged when the request fails', async () => {
    const user = userEvent.setup();
    const onSwipeStyleChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ success: false, error: 'Could not update swipe style' })),
    );

    render(<SettingsModal swipeStyle="ios" onSwipeStyleChange={onSwipeStyleChange} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Android/ }));

    expect(await screen.findByText('Could not update swipe style')).toBeInTheDocument();
    expect(onSwipeStyleChange).not.toHaveBeenCalled();
  });

  it('closes on Close button click', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<SettingsModal swipeStyle="ios" onSwipeStyleChange={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
