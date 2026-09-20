import { describe, expect, it } from 'vitest';
import { replaceConfirmMessage, summarizeReplace } from './reservationReplace';

describe('summarizeReplace', () => {
  it('pairs old and new counts per date; unknown dates count as 0', () => {
    const lines = summarizeReplace(
      [
        { date: '2026-09-20', newCount: 40 },
        { date: '2026-09-21', newCount: 10 },
      ],
      { '2026-09-20': 45 }
    );
    expect(lines).toEqual([
      { date: '2026-09-20', oldCount: 45, newCount: 40, drastic: false },
      { date: '2026-09-21', oldCount: 0, newCount: 10, drastic: false },
    ]);
  });

  it('flags a paste with fewer than 50% of the old rows, but not exactly 50%', () => {
    const lines = summarizeReplace(
      [
        { date: 'a', newCount: 24 },
        { date: 'b', newCount: 25 },
      ],
      { a: 50, b: 50 }
    );
    expect(lines[0].drastic).toBe(true);
    expect(lines[1].drastic).toBe(false);
  });

  it('never flags a first-time paste', () => {
    expect(summarizeReplace([{ date: 'a', newCount: 1 }], {})[0].drastic).toBe(false);
  });
});

describe('replaceConfirmMessage', () => {
  it('lists per-date counts and adds the extra warning only when drastic', () => {
    const calm = replaceConfirmMessage(summarizeReplace([{ date: '2026-09-20', newCount: 40 }], { '2026-09-20': 45 }));
    expect(calm).toContain('9/20: 기존 45명 → 새 40명');
    expect(calm).not.toContain('절반');

    const warn = replaceConfirmMessage(summarizeReplace([{ date: '2026-09-20', newCount: 5 }], { '2026-09-20': 45 }));
    expect(warn).toContain('9/20: 기존 45명 → 새 5명');
    expect(warn).toContain('절반도 안 돼요');
  });
});
