import { describe, expect, it } from 'vitest';
import { unseenNotices, type NoticeCandidate } from './leaveNotice';

const NOW = new Date('2026-10-10T00:00:00Z');

function req(overrides: Partial<NoticeCandidate>): NoticeCandidate {
  return { id: 'r1', staffId: 'me', status: 'approved', decidedBy: 'owner', decidedAt: '2026-10-09T00:00:00Z', ...overrides };
}

describe('unseenNotices', () => {
  it('내 신청 중 승인된 것을 알려 준다', () => {
    expect(unseenNotices([req({})], 'me', new Set(), NOW)).toHaveLength(1);
  });

  it('반려된 것도 알려 준다', () => {
    expect(unseenNotices([req({ status: 'rejected' })], 'me', new Set(), NOW)).toHaveLength(1);
  });

  it('아직 대기 중이면 알리지 않는다', () => {
    expect(unseenNotices([req({ status: 'pending', decidedAt: null, decidedBy: null })], 'me', new Set(), NOW)).toHaveLength(0);
  });

  it('남의 신청은 알리지 않는다', () => {
    expect(unseenNotices([req({ staffId: 'other' })], 'me', new Set(), NOW)).toHaveLength(0);
  });

  it('이미 본 것은 다시 알리지 않는다', () => {
    expect(unseenNotices([req({ id: 'r1' })], 'me', new Set(['r1']), NOW)).toHaveLength(0);
  });

  it('내가 직접 처리한 것(원장이 자기 신청 승인)은 알리지 않는다', () => {
    expect(unseenNotices([req({ decidedBy: 'me' })], 'me', new Set(), NOW)).toHaveLength(0);
  });

  it('14일이 지난 결과는 알리지 않는다', () => {
    expect(unseenNotices([req({ decidedAt: '2026-09-20T00:00:00Z' })], 'me', new Set(), NOW)).toHaveLength(0);
  });

  it('오래된 결정부터 순서대로', () => {
    const list = unseenNotices(
      [req({ id: 'b', decidedAt: '2026-10-09T12:00:00Z' }), req({ id: 'a', decidedAt: '2026-10-08T12:00:00Z' })],
      'me',
      new Set(),
      NOW
    );
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
