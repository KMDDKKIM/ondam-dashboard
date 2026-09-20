import { describe, expect, it } from 'vitest';
import { isMissingFunctionError } from './apiError';

describe('isMissingFunctionError', () => {
  it('detects PostgREST and Postgres missing-function errors', () => {
    expect(isMissingFunctionError({ code: 'PGRST202', message: 'x' })).toBe(true);
    expect(isMissingFunctionError({ code: '42883', message: 'x' })).toBe(true);
    expect(
      isMissingFunctionError({ message: 'Could not find the function public.replace_reservations(p_date, p_rows) in the schema cache' })
    ).toBe(true);
    expect(isMissingFunctionError(new Error('function replace_reservations(date, jsonb) does not exist'))).toBe(true);
  });

  it('is false for other errors', () => {
    expect(isMissingFunctionError({ code: '23503', message: 'foreign key violation' })).toBe(false);
    expect(isMissingFunctionError(new Error('boom'))).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
    expect(isMissingFunctionError('function missing')).toBe(false);
  });
});
