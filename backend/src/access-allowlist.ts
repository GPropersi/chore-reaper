export type AccessEnv = {
  CLOUDFLARE_ACCESS_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  ACCESS_APP_ID: string;
  ACCESS_POLICY_ID: string;
};

export type GrantResult =
  { status: 'granted' } | { status: 'already-present' } | { status: 'failed'; reason: string };

function policyUrl(env: AccessEnv): string {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps/${env.ACCESS_APP_ID}/policies/${env.ACCESS_POLICY_ID}`;
}

function includesEmail(include: unknown[], email: string): boolean {
  return include.some(
    (rule) =>
      typeof rule === 'object' &&
      rule !== null &&
      (rule as { email?: { email?: string } }).email?.email?.trim().toLowerCase() === email,
  );
}

export async function grantAccessListEntry(env: AccessEnv, rawEmail: string): Promise<GrantResult> {
  const email = rawEmail.trim().toLowerCase();
  const headers = {
    Authorization: `Bearer ${env.CLOUDFLARE_ACCESS_API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  let getRes: Response;
  try {
    getRes = await fetch(policyUrl(env), { headers });
  } catch {
    return { status: 'failed', reason: 'network error reading Access policy' };
  }
  if (!getRes.ok) {
    return { status: 'failed', reason: `unexpected status reading policy: ${getRes.status}` };
  }

  const body = (await getRes.json().catch(() => null)) as { result?: Record<string, unknown> } | null;
  const policy = body?.result;
  const include = policy?.include;
  // Fail closed on any shape surprise — never guess, never blind-overwrite.
  if (!policy || policy.decision !== 'allow' || !Array.isArray(include)) {
    return { status: 'failed', reason: 'unexpected Access policy shape' };
  }

  if (includesEmail(include, email)) {
    return { status: 'already-present' };
  }

  const updated = { ...policy, include: [...include, { email: { email } }] };

  let putRes: Response;
  try {
    putRes = await fetch(policyUrl(env), { method: 'PUT', headers, body: JSON.stringify(updated) });
  } catch {
    return { status: 'failed', reason: 'network error writing Access policy' };
  }
  if (!putRes.ok) {
    return { status: 'failed', reason: `unexpected status writing policy: ${putRes.status}` };
  }

  return { status: 'granted' };
}
