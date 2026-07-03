export type AppVariables = {
  verifiedEmail: string;
  userId: number;
  organizationId: number;
  role: 'admin' | 'member';
  timezone: string | null;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };
