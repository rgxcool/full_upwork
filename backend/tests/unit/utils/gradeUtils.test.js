import { describe, it, expect } from 'vitest';
import { gradeToNumber } from '../../../src/utils/gradeUtils.js';

describe('gradeToNumber', () => {
  it('should convert letter grades to numbers', () => {
    expect(gradeToNumber('A')).toBe(5);
    expect(gradeToNumber('B')).toBe(4);
    expect(gradeToNumber('C')).toBe(3);
    expect(gradeToNumber('D')).toBe(2);
    expect(gradeToNumber('E')).toBe(1);
    expect(gradeToNumber('F')).toBe(0);
  });

  it('should be case-insensitive', () => {
    expect(gradeToNumber('a')).toBe(5);
    expect(gradeToNumber('f')).toBe(0);
  });

  it('should return 0 for invalid grades', () => {
    expect(gradeToNumber('G')).toBe(0);
    expect(gradeToNumber('')).toBe(0);
    expect(gradeToNumber(null)).toBe(0);
    expect(gradeToNumber(undefined)).toBe(0);
  });
});
