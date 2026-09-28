@AGENTS.md

# 경희온담한의원 운영 대시보드 — 프로젝트 규칙

(마지막 수정: 2026-09-28)

## 절대 규칙

- **이 GitHub 저장소는 공개(public)다.** 환자 이름·전화번호·생년월일·차트번호 등 실제 환자와 이어지는 정보는 코드·커밋·이슈 어디에도 절대 올리지 않는다. 스크립트 작업용 임시 데이터 파일은 `scripts/` 아래(`.tsv`/`.csv`/`.json`/`*-snapshot.*`, `.gitignore`에 등록됨)에만 두고, 더 안 쓰면 디스크에서도 지운다. 실 환자 데이터를 만지는 스크립트를 실행한 뒤에는 `git status`/`git diff`로 커밋 대상에 PII가 없는지 항상 확인한 뒤 push한다.
- DB에 `alter table`/`create table` 같은 DDL을 직접 실행할 권한이 없다. 스키마 변경은 `supabase/migration_*.sql` 파일로 작성해 사용자에게 건네고, 사용자가 Supabase SQL Editor(`https://supabase.com/dashboard/project/efyrhywerannrdjimoxj/sql/new`)에서 직접 실행한다.

## 데이터·시간대

- 모든 날짜는 한국(KST) 기준 `YYYY-MM-DD` 문자열로 다룬다. 서버(Vercel)는 UTC로 돌아가므로 `new Date()`를 직접 쓰지 말고 반드시 `src/lib/kst.ts`(`todayKst`/`addDaysKst`/`diffDaysKst`/`currentMonthKst`)를 거친다.
- `daily_records`/`reservations` 등 일부 표는 RLS가 로그인한 사용자에게도 막혀 있어 `src/lib/supabase/admin.ts`의 `createAdminClient()`(service_role)로만 접근한다. 이 예약관리 앱(`ondam-dashboard`)은 예약 관리용 Supabase 프로젝트(`hanyak-ondam`)를 다른 앱(`kh-ondam-reservation`)과 공유한다 — 그쪽 표를 읽을 때도 같은 admin 클라이언트를 쓴다.
- 한의원은 주말에도 진료하지만 **추석·설 연휴 3일씩은 휴진**이다. 휴진일 목록은 `src/lib/clinicHolidays.ts`에 하드코딩돼 있다(음력이라 매년 날짜가 다름) — 새해가 되면 원장님께 그 해 날짜를 받아 배열에 추가한다. 월 목표 진도·월말 매출 예상·"어제 마감 누락" 알림이 이 목록을 쓴다.
- `replace_reservations` RPC(`src/lib/reservations/dailyRecords.server.ts`)는 그 날짜의 예약 명단을 델리트+인서트로 통째로 교체한다 — 저장할 때마다 `Reservation.id`가 새로 생기므로, 화면에서 행의 정체성을 유지해야 하는 로직(React key 등)에 `row.id`를 쓰면 안 된다.

## 외부 연동(웹훅)

- 로그인 세션 없이 외부에서 호출하는 새 라우트(카카오톡·네이버톡톡 같은 웹훅)를 추가할 때는 `src/lib/supabase/middleware.ts`의 `publicPaths` 배열에 그 경로를 반드시 추가한다. 빠뜨리면 인증 미들웨어가 302/307로 `/login`으로 돌려보내 "등록 실패"처럼 보인다.
- 외부 서비스가 문서화한 페이로드 모양을 그대로 믿지 않는다(네이버톡톡은 문서와 실제 전송 모양이 달랐다 — Slack 인커밍 웹훅 스타일). 실제 테스트 메시지로 원문을 임시 로깅해 직접 확인한 뒤 파서를 맞춘다.

## 화면 상태 관리

- 표의 행을 `key={index}`로 렌더링하는 곳에서, 입력 중(포커스가 표 안에 있는 동안)에 행 순서를 바꾸면 DOM/입력칸이 재사용되어 다른 줄에 값이 잘못 들어갈 수 있다(직접 재현해서 확인함). 정렬·재배치는 포커스가 표 밖의 버튼에 있는 순간(예: "행 추가" 클릭)에만 한다.
- "저장" 버튼 없이 자동저장하는 화면(예약관리·접수기록부)은 텍스트칸은 blur, 클릭형 값(결과 선택 등)은 클릭 즉시 저장한다. 여러 저장 요청이 순서와 다르게 도착해 최신 값을 덮어쓰지 않도록 `useRef<Promise<void>>`로 저장 큐를 순서대로 체이닝한다. 저장 성공은 조용히 처리하고(문구 없음), 실패했을 때만 알린다.

## 개발 확인 순서

변경 후에는 항상 `npx tsc --noEmit`과 `npx vitest run`을 돌려 통과를 확인하고, 화면에 보이는 변경이면 브라우저에서 실제로 조작해 새로고침해도 값이 남는지까지 확인한다. 비즈니스 로직은 `src/lib/*.ts`의 순수 함수로 만들고 테스트를 붙인다 — 컴포넌트에 계산 로직을 직접 넣지 않는다.
