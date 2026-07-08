export type AppVariables = {
  verifiedEmail: string;
  userId: number;
  householdId: number;
  role: 'admin' | 'user';
  timezone: string | null;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };
