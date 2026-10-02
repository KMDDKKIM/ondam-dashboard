// 홈 달력(한의원 이벤트 + 연차)에 쓰는 순수 로직. 화면/DB 코드는 따로 있다.

import { addDaysKst } from './kst';

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
  eventDate: string;
  title: string;
}

export interface LeaveInput {
  id: string;
  staffName: string;
  startDate: string;
  endDate: string;
  halfDay: 'am' | 'pm' | null;
}

/**
 * 이벤트(하루짜리)와 승인된 연차 신청(기간)을 날짜별로 합친다. [from, to] 범위 밖으로
 * 넘치는 연차 구간은 범위 안쪽만 잘라서 담는다(달력 그리드에 보일 날짜만 있으면 되므로).
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

  for (const e of events) {
    if (e.eventDate < from || e.eventDate > to) continue;
    entryFor(e.eventDate).events.push({ id: e.id, title: e.title });
  }

  for (const l of leaves) {
    let d = l.startDate < from ? from : l.startDate;
    const end = l.endDate > to ? to : l.endDate;
    while (d <= end) {
      entryFor(d).leaves.push({ id: l.id, staffName: l.staffName, halfDay: l.halfDay });
      d = addDaysKst(d, 1);
    }
  }

  return map;
}
