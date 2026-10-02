import { describe, expect, it } from 'vitest';
import { assignEventLanes, buildDayEntries, eventSegment } from './homeCalendar';

const ev = (id: string, startDate: string, endDate: string = startDate, title = id) => ({ id, title, startDate, endDate });

describe('buildDayEntries', () => {
  it('이벤트가 없으면 빈 맵', () => {
    expect(buildDayEntries([], [], '2026-10-01', '2026-10-31').size).toBe(0);
  });

  it('하루짜리 이벤트를 그 날짜에 담는다', () => {
    const map = buildDayEntries([ev('e1', '2026-10-05', '2026-10-05', '정기 휴무')], [], '2026-10-01', '2026-10-31');
    expect(map.get('2026-10-05')?.events).toEqual([{ id: 'e1', title: '정기 휴무' }]);
  });

  it('기간 이벤트를 날마다 펼쳐 담는다', () => {
    const map = buildDayEntries([ev('e1', '2026-10-05', '2026-10-07')], [], '2026-10-01', '2026-10-31');
    expect(map.get('2026-10-05')?.events).toHaveLength(1);
    expect(map.get('2026-10-06')?.events).toHaveLength(1);
    expect(map.get('2026-10-07')?.events).toHaveLength(1);
    expect(map.has('2026-10-08')).toBe(false);
  });

  it('범위 밖 이벤트는 빠지고, 범위에 걸친 이벤트는 안쪽만 담는다', () => {
    const map = buildDayEntries(
      [ev('out', '2026-11-05'), ev('edge', '2026-09-29', '2026-10-02')],
      [],
      '2026-10-01',
      '2026-10-31'
    );
    expect(map.has('2026-11-05')).toBe(false);
    expect(map.has('2026-09-29')).toBe(false);
    expect(map.get('2026-10-02')?.events).toHaveLength(1);
  });

  it('연차 기간을 날마다 펼쳐 담고, 반차 표시를 보존한다', () => {
    const map = buildDayEntries(
      [],
      [
        { id: 'l1', staffName: '박소은', startDate: '2026-10-05', endDate: '2026-10-06', halfDay: null, status: 'approved' },
        { id: 'l2', staffName: '이정민', startDate: '2026-10-05', endDate: '2026-10-05', halfDay: 'am', status: 'pending' },
      ],
      '2026-10-01',
      '2026-10-31'
    );
    expect(map.get('2026-10-05')?.leaves).toHaveLength(2);
    expect(map.get('2026-10-05')?.leaves[1].halfDay).toBe('am');
    expect(map.get('2026-10-05')?.leaves[0].status).toBe('approved');
    expect(map.get('2026-10-05')?.leaves[1].status).toBe('pending');
    expect(map.get('2026-10-06')?.leaves).toHaveLength(1);
  });

  it('같은 날 이벤트와 연차가 같이 담긴다', () => {
    const map = buildDayEntries(
      [ev('e1', '2026-10-05')],
      [{ id: 'l1', staffName: '박소은', startDate: '2026-10-05', endDate: '2026-10-05', halfDay: null, status: 'approved' }],
      '2026-10-01',
      '2026-10-31'
    );
    expect(map.get('2026-10-05')?.events).toHaveLength(1);
    expect(map.get('2026-10-05')?.leaves).toHaveLength(1);
  });
});

describe('assignEventLanes', () => {
  it('겹치지 않으면 한 줄을 재사용한다', () => {
    const lanes = assignEventLanes([ev('a', '2026-10-01', '2026-10-03'), ev('b', '2026-10-04', '2026-10-05')]);
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(0);
  });

  it('겹치면 다른 줄에 놓는다', () => {
    const lanes = assignEventLanes([ev('a', '2026-10-01', '2026-10-05'), ev('b', '2026-10-03', '2026-10-04')]);
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(1);
  });

  it('끝난 날과 같은 날 시작하면 겹친 것으로 본다', () => {
    const lanes = assignEventLanes([ev('a', '2026-10-01', '2026-10-03'), ev('b', '2026-10-03', '2026-10-04')]);
    expect(lanes.get('b')).toBe(1);
  });

  it('같은 날 시작이면 긴 것이 윗줄', () => {
    const lanes = assignEventLanes([ev('short', '2026-10-01', '2026-10-01'), ev('long', '2026-10-01', '2026-10-09')]);
    expect(lanes.get('long')).toBe(0);
    expect(lanes.get('short')).toBe(1);
  });
});

describe('eventSegment', () => {
  const e = ev('x', '2026-10-06', '2026-10-09'); // 화~금

  it('이벤트 밖 날짜는 null', () => {
    expect(eventSegment(e, '2026-10-05', 1)).toBeNull();
    expect(eventSegment(e, '2026-10-10', 6)).toBeNull();
  });

  it('첫날은 시작 모서리 + 제목, 같은 주 끝까지의 칸 수를 span으로', () => {
    expect(eventSegment(e, '2026-10-06', 2)).toEqual({ isStart: true, isEnd: false, showLabel: true, span: 4 });
  });

  it('중간 칸은 제목 없이 이어진다', () => {
    expect(eventSegment(e, '2026-10-07', 3)).toEqual({ isStart: false, isEnd: false, showLabel: false, span: 3 });
  });

  it('마지막 날은 끝 모서리', () => {
    expect(eventSegment(e, '2026-10-09', 5)).toEqual({ isStart: false, isEnd: true, showLabel: false, span: 1 });
  });

  it('주가 바뀌면 일요일 칸에서 제목을 다시 적고 span은 그 주 안으로 자른다', () => {
    const long = ev('y', '2026-10-08', '2026-10-20');
    expect(eventSegment(long, '2026-10-11', 0)).toEqual({ isStart: false, isEnd: false, showLabel: true, span: 7 });
  });

  it('하루짜리는 시작·끝 모두', () => {
    expect(eventSegment(ev('z', '2026-10-06'), '2026-10-06', 2)).toEqual({ isStart: true, isEnd: true, showLabel: true, span: 1 });
  });
});
