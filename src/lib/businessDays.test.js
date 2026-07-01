import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addBusinessDays } from './businessDays.js';

describe('addBusinessDays', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds 1 business day from a Friday, landing on Monday', () => {
    vi.setSystemTime(new Date('2026-06-26T10:00:00')); // Friday
    expect(addBusinessDays(1)).toBe('2026-06-29'); // Monday
  });

  it('adds 1 business day from a Monday, landing on Tuesday', () => {
    vi.setSystemTime(new Date('2026-06-22T10:00:00')); // Monday
    expect(addBusinessDays(1)).toBe('2026-06-23');
  });

  it('adds 4 business days from a Monday, skipping the weekend', () => {
    vi.setSystemTime(new Date('2026-06-22T10:00:00')); // Monday
    expect(addBusinessDays(4)).toBe('2026-06-26'); // Friday
  });

  it('adds 5 business days from a Monday, landing on the next Monday', () => {
    vi.setSystemTime(new Date('2026-06-22T10:00:00')); // Monday
    expect(addBusinessDays(5)).toBe('2026-06-29');
  });
});
