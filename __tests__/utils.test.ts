import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn (className helper)', () => {
  it('joins multiple class names', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz');
  });

  it('filters out falsy values', () => {
    expect(cn('foo', undefined, 'bar', null, false, 'baz')).toBe('foo bar baz');
  });

  it('returns empty string for no classes', () => {
    expect(cn()).toBe('');
  });

  it('returns empty string for all falsy values', () => {
    expect(cn(undefined, null, false)).toBe('');
  });

  it('handles single class', () => {
    expect(cn('single')).toBe('single');
  });

  it('handles conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });
});
