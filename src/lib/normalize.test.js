import { describe, it, expect } from 'vitest';
import { normalizeText } from './normalize.js';

describe('normalizeText', () => {
  it('lowercases the input', () => {
    expect(normalizeText('HubSpot')).toBe('hubspot');
  });

  it('strips accented vowels and the enie', () => {
    expect(normalizeText('José Núñez')).toBe('jose nunez');
  });

  it('collapses multiple internal whitespace into one space', () => {
    expect(normalizeText('  Jorge   Arauz  ')).toBe('jorge arauz');
  });

  it('handles all configured accented characters', () => {
    expect(normalizeText('áéíóúñ')).toBe('aeioun');
  });
});
