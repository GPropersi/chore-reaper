import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrganizationSection from './OrganizationSection';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('OrganizationSection', () => {
  it('submits the selected timezone to PATCH /api/organizations/:id and reports it back on success', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/organizations/1' && init?.method === 'PATCH') {
        const body = JSON.parse(init.body as string);
        return jsonResponse({ success: true, data: { id: 1, name: 'Org', timezone: body.timezone } });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onTimezoneChange = vi.fn();

    render(
      <OrganizationSection
        organizationId={1}
        organizationTimezone="UTC"
        onTimezoneChange={onTimezoneChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Timezone'), 'America/Chicago');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText('Saved.');
    expect(onTimezoneChange).toHaveBeenCalledWith('America/Chicago');
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      timezone: 'America/Chicago',
    });
  });

  it('shows an error banner instead of a saved message when the request fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ success: false, error: 'Invalid timezone' }, 400)),
    );

    render(<OrganizationSection organizationId={1} organizationTimezone="UTC" onTimezoneChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Invalid timezone')).toBeInTheDocument();
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });
});
