import { describe, it, expect, afterEach, vi } from 'vitest';
import { grantAccessListEntry } from '../src/access-allowlist.js';

const TEST_ENV = {
  CLOUDFLARE_ACCESS_API_TOKEN: 'test-token',
  CF_ACCOUNT_ID: 'test-account',
  ACCESS_POLICY_ID: 'test-policy',
};

// Reusable policies (this policy has `"reusable": true`) are edited via the
// standalone endpoint, not an app-nested path — see access-allowlist.ts.
const POLICY_URL = 'https://api.cloudflare.com/client/v4/accounts/test-account/access/policies/test-policy';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function basePolicy(include: unknown[]) {
  return {
    id: 'test-policy',
    decision: 'allow',
    name: 'Allow household',
    session_duration: '730h',
    include,
  };
}

function isPut(init?: RequestInit): boolean {
  return init?.method === 'PUT';
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('grantAccessListEntry', () => {
  it('appends the email to the include list, preserving every existing entry verbatim', async () => {
    const existing = [{ email: { email: 'admin@example.com' } }];
    const putCalls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (!isPut(init)) return jsonResponse({ result: basePolicy(existing) });
        putCalls.push({ url, body: JSON.parse(init!.body as string) });
        return jsonResponse({
          result: { ...basePolicy(existing), include: JSON.parse(init!.body as string).include },
        });
      }),
    );

    const result = await grantAccessListEntry(TEST_ENV, 'new@example.com');

    expect(result).toEqual({ status: 'granted' });
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].url).toBe(POLICY_URL);
    expect(putCalls[0].body).toMatchObject({
      decision: 'allow',
      include: [{ email: { email: 'admin@example.com' } }, { email: { email: 'new@example.com' } }],
    });
  });

  it('is idempotent: makes no PUT call when the email is already present (case/whitespace-normalized)', async () => {
    const existing = [{ email: { email: 'admin@example.com' } }];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (isPut(init)) throw new Error('PUT should never be called when already present');
      return jsonResponse({ result: basePolicy(existing) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await grantAccessListEntry(TEST_ENV, '  Admin@Example.com  ');

    expect(result).toEqual({ status: 'already-present' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed and never calls PUT when the policy shape is unexpected (missing include)', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (isPut(init)) throw new Error('PUT should never be called on unexpected shape');
      return jsonResponse({ result: { id: 'test-policy', decision: 'allow' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await grantAccessListEntry(TEST_ENV, 'new@example.com');

    expect(result.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed and never calls PUT when the policy decision is not "allow"', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (isPut(init)) throw new Error('PUT should never be called on unexpected decision');
      return jsonResponse({ result: { ...basePolicy([]), decision: 'non_identity' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await grantAccessListEntry(TEST_ENV, 'new@example.com');

    expect(result.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns failed (not a throw) when the GET request errors over the network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unreachable');
      }),
    );

    const result = await grantAccessListEntry(TEST_ENV, 'new@example.com');

    expect(result.status).toBe('failed');
  });

  it('returns failed (not a throw) when the GET request returns a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'forbidden' }, 403)),
    );

    const result = await grantAccessListEntry(TEST_ENV, 'new@example.com');

    expect(result.status).toBe('failed');
  });

  it('returns failed (not a throw) when the PUT request errors over the network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (isPut(init)) throw new Error('network unreachable');
        return jsonResponse({ result: basePolicy([]) });
      }),
    );

    const result = await grantAccessListEntry(TEST_ENV, 'new@example.com');

    expect(result.status).toBe('failed');
  });

  it('returns failed (not a throw) when the PUT request returns a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (isPut(init)) return jsonResponse({ error: 'conflict' }, 409);
        return jsonResponse({ result: basePolicy([]) });
      }),
    );

    const result = await grantAccessListEntry(TEST_ENV, 'new@example.com');

    expect(result.status).toBe('failed');
  });

  it('normalizes the email (trim + lowercase) in the written include entry', async () => {
    let putBody: { include: { email: { email: string } }[] } | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (isPut(init)) {
          putBody = JSON.parse(init!.body as string);
          return jsonResponse({ result: basePolicy(putBody!.include) });
        }
        return jsonResponse({ result: basePolicy([]) });
      }),
    );

    await grantAccessListEntry(TEST_ENV, '  New@Example.com  ');

    expect(putBody?.include).toEqual([{ email: { email: 'new@example.com' } }]);
  });
});
