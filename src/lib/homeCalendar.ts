// 홈 달력(한의원 이벤트 기간 + 연차)에 쓰는 순수 로직. 화면/DB 코드는 따로 있다.

import { addDaysKst, diffDaysKst } from './kst';

export interface CalendarEvent {
  id: string;
  title: string;
}

export interface CalendarLeave {
  id: string;
  staffName: string;
  halfDay: 'am' | 'pm' | null;
}

export interface DayEntries {
  events: CalendarEvent[];
  leaves: CalendarLeave[];
}

export interface EventInput {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
}

export interface LeaveInput {
  id: string;
  staffName: string;
  startDate: string;
  endDate: string;
  halfDay: 'am' | 'pm' | null;
}

/**
 * 이벤트(기간)와 승인된 연차 신청(기간)을 날짜별로 합친다. [from, to] 범위 밖으로 넘치는
 * 구간은 범위 안쪽만 잘라서 담는다(달력 그리드에 보일 날짜만 있으면 되므로).
 */
export function buildDayEntries(
  events: EventInput[],
  leaves: LeaveInput[],
  from: string,
  to: string
): Map<string, DayEntries> {
  const map = new Map<string, DayEntries>();

  function entryFor(date: string): DayEntries {
    let entry = map.get(date);
    if (!entry) {
      entry = { events: [], leaves: [] };
      map.set(date, entry);
    }
    return entry;
  }

  function eachDay(start: string, end: string, fn: (date: string) => void) {
    let d = start < from ? from : start;
    const last = end > to ? to : end;
    while (d <= last) {
      fn(d);
      d = addDaysKst(d, 1);
    }
  }

  for (const e of events) eachDay(e.startDate, e.endDate, (d) => entryFor(d).events.push({ id: e.id, title: e.title }));
  for (const l of leaves) {
    eachDay(l.startDate, l.endDate, (d) => entryFor(d).leaves.push({ id: l.id, staffName: l.staffName, halfDay: l.halfDay }));
  }

  return map;
}

/**
 * 기간 이벤트를 달력에서 가로 막대로 그릴 때 서로 안 겹치게 "줄"(0부터)을 배정한다.
 * 시작이 빠른 순(같으면 긴 것 먼저)으로 훑으며, 앞 이벤트가 끝난 줄을 재사용한다.
 */
export function assignEventLanes(events: { id: string; startDate: string; endDate: string }[]): Map<string, number> {
  const sorted = [...events].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate) || a.id.localeCompare(b.id)
  );
  const laneEnds: string[] = [];
  const lanes = new Map<string, number>();
  for (const e of sorted) {
    let lane = laneEnds.findIndex((end) => end < e.startDate);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e.endDate);
    } else {
      laneEnds[lane] = e.endDate;
    }
    lanes.set(e.id, lane);
  }
  return lanes;
}

export interface EventSegment {
  /** 이 칸이 이벤트의 첫날인가(둥근 왼쪽 모서리). */
  isStart: boolean;
  /** 이 칸이 이벤트의 마지막 날인가(둥근 오른쪽 모서리). */
  isEnd: boolean;
  /** 이 칸에서 제목을 적는가 — 첫날이거나, 주가 바뀌어 일요일 칸에서 막대가 다시 시작할 때. */
  showLabel: boolean;
  /** 제목을 적는 칸이면, 이 칸부터 같은 주 안에서 막대가 이어지는 칸 수(제목이 흐를 수 있는 폭). */
  span: number;
}

/** date 칸(주 안에서 colIndex: 일요일=0)에 그려질 이벤트 막대 조각의 모양. 이벤트가 이 날짜에 없으면 null. */
export function eventSegment(
  event: { startDate: string; endDate: string },
  date: string,
  colIndex: number
): EventSegment | null {
  if (date < event.startDate || date > event.endDate) return null;
  const isStart = date === event.startDate;
  const isEnd = date === event.endDate;
  const showLabel = isStart || colIndex === 0;
  const daysLeft = diffDaysKst(date, event.endDate);
  const span = Math.min(daysLeft, 6 - colIndex) + 1;
  return { isStart, isEnd, showLabel, span };
}
