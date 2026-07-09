export type AccessEnv = {
  CLOUDFLARE_ACCESS_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  ACCESS_POLICY_ID: string;
};

export type GrantResult =
  { status: 'granted' } | { status: 'already-present' } | { status: 'failed'; reason: string };

// This targets Cloudflare's *reusable* Access policy — the household allow-list
// is a `"reusable": true` policy object, not one inline/exclusive to a single
// Application. Cloudflare documents editing reusable policies via this
// standalone endpoint, not the app-nested `/access/apps/{app_id}/policies/{id}`
// path — the nested path can read a reusable policy but isn't the documented
// way to write to one.
function policyUrl(env: AccessEnv): string {
  return `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/policies/${env.ACCESS_POLICY_ID}`;
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

// Shared by every route that creates/adds a member and needs to best-effort
// grant Cloudflare Access — the D1 write is always authoritative and never
// rolled back over an Access-API problem; a failure just degrades to the
// same manual fallback ("add them in the dashboard") that existed before
// auto-granting did. Designed to never throw, but callers get a plain string
// back regardless of whether grantAccessListEntry itself threw, so a bug in
// it can never fail the request.
export async function grantAccessAndDescribeWarning(
  env: AccessEnv,
  email: string,
  logContext: Record<string, unknown>,
): Promise<string | undefined> {
  try {
    const grant = await grantAccessListEntry(env, email);
    if (grant.status === 'failed') {
      console.log(
        JSON.stringify({ event: 'access-grant-failed', email, reason: grant.reason, ...logContext }),
      );
      return `Member added, but could not be added to the Cloudflare Access allow-list automatically (${grant.reason}). Add ${email} manually in the Zero Trust dashboard.`;
    }
    console.log(JSON.stringify({ event: 'access-grant', email, ...logContext }));
    return undefined;
  } catch (err) {
    console.log(JSON.stringify({ event: 'access-grant-threw', email, error: String(err), ...logContext }));
    return `Member added, but could not be added to the Cloudflare Access allow-list automatically. Add ${email} manually in the Zero Trust dashboard.`;
  }
}
