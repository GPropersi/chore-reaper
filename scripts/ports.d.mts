export interface PortSet {
  TT_JWKS_PORT: number;
  TT_BACKEND_PORT: number;
  TT_FRONTEND_PORT: number;
}

export interface ResolvedPorts extends PortSet {
  TT_SLOT: number;
}

export type PortsSource = 'default' | 'file' | 'env';

export const DEFAULT_PORTS: Readonly<PortSet>;
export const REPO_ROOT: string;

export function crc32(str: string): number;
export function parseEnvFile(text: string): Record<string, string>;
export function formatEnvFile(obj: Record<string, string | number>): string;
export function probePort(port: number): Promise<boolean>;

export function resolvePorts(options?: {
  slug?: string;
  primary?: boolean;
  env?: Record<string, string | undefined>;
  claimedSlots?: Set<number>;
  isFree?: (port: number) => boolean | Promise<boolean>;
}): Promise<ResolvedPorts>;

export function loadPorts(options?: { cwd?: string; env?: Record<string, string | undefined> }): {
  ports: PortSet;
  source: PortsSource;
};
