import { describe, expect, it } from 'vitest';
import { isNewer } from '../src/update-check.js';

describe('update check version comparison', () => {
  it('detects newer patch/minor/major versions', () => {
    expect(isNewer('2.4.1', '2.4.0')).toBe(true);
    expect(isNewer('2.5.0', '2.4.9')).toBe(true);
    expect(isNewer('3.0.0', '2.9.9')).toBe(true);
  });

  it('does not report same, older, or invalid versions as newer', () => {
    expect(isNewer('2.4.0', '2.4.0')).toBe(false);
    expect(isNewer('2.3.9', '2.4.0')).toBe(false);
    expect(isNewer('not-a-version', '2.4.0')).toBe(false);
  });
});
