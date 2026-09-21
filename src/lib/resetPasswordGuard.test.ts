import { describe, expect, it } from 'vitest';
import { checkResetTarget } from './resetPasswordGuard';

const staff = { id: 'a', role: 'staff', status: 'approved' };

describe('checkResetTarget', () => {
  it('allows an approved staff member', () => {
    expect(checkResetTarget(staff, 'owner-id')).toEqual({ ok: true });
  });
  it('404s when the target is missing', () => {
    expect(checkResetTarget(null, 'owner-id')).toMatchObject({ ok: false, status: 404 });
  });
  it('rejects the requester themselves', () => {
    expect(checkResetTarget(staff, 'a')).toMatchObject({ ok: false, status: 400 });
  });
  it('rejects owners', () => {
    expect(checkResetTarget({ ...staff, role: 'owner' }, 'x')).toMatchObject({ ok: false, status: 400 });
  });
  it('rejects pending accounts', () => {
    expect(checkResetTarget({ ...staff, status: 'pending' }, 'x')).toMatchObject({ ok: false, status: 400 });
  });
  it('fails closed on unknown role or status', () => {
    expect(checkResetTarget({ ...staff, role: null }, 'x').ok).toBe(false);
    expect(checkResetTarget({ ...staff, status: null }, 'x').ok).toBe(false);
    expect(checkResetTarget({ ...staff, role: 'admin' }, 'x').ok).toBe(false);
  });
});
