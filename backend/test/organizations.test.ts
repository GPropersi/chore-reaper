import { describe, it, expect } from 'vitest';
import { isValidTimezone } from '../src/organizations.js';

describe('isValidTimezone', () => {
  it('accepts a real IANA timezone', () => {
    expect(isValidTimezone('America/Chicago')).toBe(true);
  });

  it('accepts UTC', () => {
    expect(isValidTimezone('UTC')).toBe(true);
  });

  it('rejects a made-up zone', () => {
    expect(isValidTimezone('Not/AZone')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidTimezone('')).toBe(false);
  });
});
