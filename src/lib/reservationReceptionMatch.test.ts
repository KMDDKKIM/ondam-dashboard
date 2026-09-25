import { describe, expect, it } from 'vitest';
import { attendanceNamesFrom, countMarkedAttendance, matchAttendance } from './reservationReceptionMatch';

function res(patientName: string, visitStatus = '내원') {
  return { patientName, visitStatus };
}

describe('예약·접수기록부 대조', () => {
  it('전원 접수기록부에서 찾으면 노쇼 0명', () => {
    const result = matchAttendance([res('홍길동'), res('성춘향'), res('이몽룡')], ['홍길동', '성춘향', '이몽룡']);
    expect(result).toEqual({ keptCount: 3, cancelCount: 0, noshowCount: 0 });
  });

  it('진짜 노쇼: 접수기록부에 이름이 없다', () => {
    const result = matchAttendance([res('홍길동'), res('성춘향')], ['홍길동']);
    expect(result).toEqual({ keptCount: 1, cancelCount: 0, noshowCount: 1 });
  });

  it('취소로 표시된 예약은 노쇼·정상 이행 계산에서 빠진다', () => {
    const result = matchAttendance([res('홍길동', '취소'), res('성춘향')], ['성춘향']);
    expect(result).toEqual({ keptCount: 1, cancelCount: 1, noshowCount: 0 });
  });

  it('동명이인 중복 예약은 접수기록부에 하나만 있으면 하나만 매칭된다(멀티셋 안전성)', () => {
    const result = matchAttendance([res('홍길동'), res('홍길동')], ['홍길동']);
    expect(result).toEqual({ keptCount: 1, cancelCount: 0, noshowCount: 1 });
  });

  it('접수기록부에 예약 명단과 무관한 워크인 이름이 있어도 예약 쪽 집계에 영향 없다', () => {
    const result = matchAttendance([res('홍길동')], ['홍길동', '워크인환자']);
    expect(result).toEqual({ keptCount: 1, cancelCount: 0, noshowCount: 0 });
  });

  it('빈 이름·공백 이름은 매칭되지 않는다', () => {
    const result = matchAttendance([res(''), res('   '), res('홍길동')], ['', '  ', '홍길동']);
    expect(result).toEqual({ keptCount: 1, cancelCount: 0, noshowCount: 2 });
  });

  it('이름의 공백 차이는 무시하고 매칭한다', () => {
    const result = matchAttendance([res('홍 길동')], ['홍길동']);
    expect(result).toEqual({ keptCount: 1, cancelCount: 0, noshowCount: 0 });
  });

  it('실전 시나리오: 예약 6명 중 정상 이행·취소·노쇼가 섞여 있다', () => {
    const reservations = [
      res('홍길동'), // 내원, 접수기록부에 있음 → kept
      res('성춘향'), // 내원, 접수기록부에 있음 → kept
      res('이몽룡', '취소'), // 취소
      res('강백호'), // 내원인데 접수기록부에 없음 → noshow
      res('서태웅'), // 내원, 접수기록부에 있음 → kept
      res('채치수', '취소'), // 취소
    ];
    const receptionNames = ['홍길동', '성춘향', '서태웅', '워크인손님'];
    const result = matchAttendance(reservations, receptionNames);
    // 손 계산: kept = 3(홍길동·성춘향·서태웅), cancel = 2(이몽룡·채치수), noshow = 6 - 3 - 2 = 1(강백호)
    expect(result).toEqual({ keptCount: 3, cancelCount: 2, noshowCount: 1 });
  });
});

describe('countMarkedAttendance', () => {
  it('아무 것도 표시가 안 돼 있으면 null(이름 대조로 넘긴다)', () => {
    expect(countMarkedAttendance([res('홍길동', ''), res('성춘향', '취소')])).toBeNull();
  });

  it('하나라도 정상이행/노쇼 표시가 있으면 직접 센다', () => {
    const result = countMarkedAttendance([
      res('홍길동', '정상이행'),
      res('성춘향', '노쇼'),
      res('이몽룡', '취소'),
      res('강백호', ''), // 아직 미정 — 어느 쪽에도 안 낀다
    ]);
    expect(result).toEqual({ keptCount: 1, noshowCount: 1 });
  });

  it('전원 정상이행이면 노쇼 0', () => {
    expect(countMarkedAttendance([res('홍길동', '정상이행'), res('성춘향', '정상이행')])).toEqual({ keptCount: 2, noshowCount: 0 });
  });

  it('붙여넣은 표의 기본값 "내원"만으로는 표시로 치지 않는다(직접 눌러야만)', () => {
    // OK차트 예약표는 취소만 아니면 항상 '내원'이라고 적어 두므로, 방문 전 명단은 이게 전부 '내원'이다.
    expect(countMarkedAttendance([res('홍길동', '내원'), res('성춘향', '내원')])).toBeNull();
  });
});

describe('제외 표시한 분은 정상이행 이름 대조에서 뺀다', () => {
  const rec = (patientName: string, excluded = false) => ({ patientName, excluded });

  it('제외 표시한 사람의 이름은 대조 대상에서 빠진다', () => {
    expect(attendanceNamesFrom([rec('홍길동'), rec('성춘향', true), rec('이몽룡')])).toEqual(['홍길동', '이몽룡']);
  });

  it('excluded 값이 없어도(옛 기록) 그대로 대조 대상이다', () => {
    expect(attendanceNamesFrom([{ patientName: '홍길동' }, { patientName: '성춘향' }])).toEqual(['홍길동', '성춘향']);
  });

  it('예약자였지만 안 오셨는데 처방전 출력으로 접수기록부에 잡힌 분(제외)은 정상이행이 아니라 노쇼로 센다', () => {
    const reservations = [res('홍길동'), res('성춘향'), res('이몽룡')];
    const records = [rec('홍길동'), rec('성춘향', true), rec('이몽룡')];
    // 제외를 안 뺐다면 3/0/0(성춘향이 정상이행)으로 부풀려진다.
    expect(matchAttendance(reservations, attendanceNamesFrom(records))).toEqual({ keptCount: 2, cancelCount: 0, noshowCount: 1 });
    expect(matchAttendance(reservations, records.map((r) => r.patientName))).toEqual({ keptCount: 3, cancelCount: 0, noshowCount: 0 });
  });

  it('예약자가 아닌 제외 대상은 아무것도 바꾸지 않는다', () => {
    const reservations = [res('홍길동'), res('성춘향')];
    const records = [rec('홍길동'), rec('성춘향'), rec('김철수', true)];
    expect(matchAttendance(reservations, attendanceNamesFrom(records))).toEqual({ keptCount: 2, cancelCount: 0, noshowCount: 0 });
  });
});
