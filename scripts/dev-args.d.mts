import type { PortSet, PortsSource } from './ports.mjs';

interface DevArgsInput {
  ports: PortSet;
  source: PortsSource;
}

export function buildWranglerArgs(input: DevArgsInput): string[];
export function buildViteServerOptions(input: DevArgsInput): { port: number; strictPort?: true };
export function buildVitePreviewOptions(input: DevArgsInput): { port?: number; strictPort?: true };
