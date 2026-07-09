export type AppVariables = {
  verifiedEmail: string;
  userId: number;
  householdId: number;
  isAdmin: boolean;
  timezone: string | null;
  swipeStyle: 'ios' | 'android';
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };
