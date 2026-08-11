// The minimal per-user context every authenticated request carries: the
// Access-verified email plus the resolved users.id. resolveUser (per-user,
// not household-scoped) sets these and nothing more.
export type BaseVariables = {
  verifiedEmail: string;
  userId: number;
};

// The full household-scoped context. Composed from BaseVariables so the two
// never drift — same six fields as before, now with the per-user pair factored
// out. householdScope/require-global-admin populate the household-only fields.
export type AppVariables = BaseVariables & {
  householdId: number;
  isAdmin: boolean;
  timezone: string | null;
  swipeStyle: 'ios' | 'android';
};

// Narrow env for per-user routes/middleware (e.g. notifications) — c.var here
// exposes only { verifiedEmail, userId }, so household-only vars can't be read
// where nothing sets them.
export type BaseEnv = { Bindings: Env; Variables: BaseVariables };

export type AppEnv = { Bindings: Env; Variables: AppVariables };
