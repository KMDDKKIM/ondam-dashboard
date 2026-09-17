# 경희온담한의원 운영 대시보드 — 설계 문서 (Phase 1 & 2)

- 날짜: 2026-09-17
- 상태: 승인 대기
- 범위: 이 문서는 **Phase 1(레이아웃+네비게이션+홈)**과 **Phase 2(Supabase 연결+인증+데이터 모델)**만 구현 대상으로 다룬다. 나머지 7개 하위 페이지는 각각 별도의 브레인스토밍 → 스펙 → 계획 사이클을 거친다.

## 1. 배경 / 목적

경희온담한의원은 이미 두 개의 독립된 도구를 쓰고 있다 — 예약 관리 웹앱과 한약 복용법 출력 자동화 도구. 이번엔 이 둘을 포함해 병원 운영 전반(해피콜, 치료실 타이머, 비급여/이벤트 환자 관리, 물품신청, 매출 목표 추적 등)을 한 곳에서 볼 수 있는 새 대시보드 홈페이지를 만든다.

기존 두 도구는 그대로 유지하고, 이 대시보드에서는 외부 링크로 연결한다. 나머지 기능은 이 새 프로젝트 안에 하나씩 만들어 나간다.

## 2. 범위

**Phase 1 — 레이아웃 + 네비게이션 + 홈**
- 좌측 사이드바 (9개 메뉴)
- 홈 화면 (9개 카드, 버튼만 — 목표 진행률 위젯은 제외)
- Supabase Auth 로그인 화면 + 인증 게이트

**Phase 2 — Supabase 연결 + 데이터 모델**
- 새 Supabase 프로젝트 생성
- `staff` 테이블 + 초기 계정 2개(원장 박소은, 김동규) 생성
- 나머지 7개 테이블은 **스펙에만 제안**하고 실제 생성은 각 페이지 구현 시점으로 미룸

**이번 범위 아님 (각 페이지별로 추후 별도 브레인스토밍)**
- 초진환자 해피콜 / 치료실 타이머 / 해피콜 목록 / 비급여 환자 목록 / 이벤트 환자 목록 / 비대면진료 알람 / 물품신청 — 실제 기능 구현
- 홈 화면의 "이번달 목표 대비 진행률" 위젯 (매출 데이터 입력 UI가 필요하므로 관련 페이지와 함께 다룸)
- Vercel 배포 (Phase 1+2가 로컬에서 동작 확인된 뒤, 사용자 요청 시 진행)

## 3. 기술 스택

- Next.js (App Router), TypeScript
- Supabase — Auth(이메일/비밀번호) + Postgres + Realtime
- Supabase 프로젝트: 무료 티어 2개 제한 때문에 예약관리 앱과 같은 `hanyak-ondam` 프로젝트를 공유 (Phase 1+2 구현 중 사용자 승인, 2026-09-17). 테이블 이름은 prefix 없이 그대로 추가 — 지금까지 `staff` 하나뿐이고 기존 테이블(`prescriptions`, `daily_records`, `reservations`, `monthly_goals`)과 겹치지 않았음. **앞으로 나머지 7개 테이블(§5 "스펙에만 제안" 목록)을 만들 때마다 먼저 `hanyak-ondam`에 같은 이름의 테이블이 이미 있는지 확인할 것** — 특히 `events`처럼 흔한 이름은 충돌 가능성이 있음. 두 앱은 같은 프로젝트의 anon key와 service_role key를 공유하므로, service_role key를 쓰는 예약관리 앱의 서버 코드는 이 앱의 `staff` 테이블도 RLS 없이 접근 가능함 — 별도 접근 제어가 필요해지면 그때 재검토
- 배포: Vercel (나중에, 예약관리 앱과 동일 패턴 — GitHub 연결 후 push 시 자동 배포)

## 4. 인증

- Supabase Auth(이메일/비밀번호)로 원장·직원 개인별 로그인 — 예약관리 앱의 "공유 비밀번호 1개" 방식과 다름
- `staff` 테이블에 로그인한 사용자의 이름·역할을 저장, 물품신청 등에서 "누가 했는지" 기록에 사용
- Next.js `proxy.ts`(미들웨어)로 미로그인 접근을 `/login`으로 리다이렉트 — 예약관리 앱에서 이미 검증된 패턴 재사용
- RLS: 로그인한 사용자(authenticated)는 `staff` 전체 조회 가능(직원 목록 표시용). 본인 행은 `name`만 수정 가능 — `role`은 authenticated 권한으로 수정 불가(컬럼 단위 GRANT로 제한, 최종 리뷰에서 발견된 자가 권한상승 문제 수정). 원장 전용 기능(예: 물품신청 승인)이 필요한 페이지는 그 페이지를 만들 때 `staff.role`을 확인하는 조건을 추가한다. 지금 단계에서 세분화된 권한 체계를 미리 만들지 않는다(YAGNI)

## 5. 데이터 모델

### Phase 2에서 실제로 생성

**`staff`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | `auth.users.id`와 동일 |
| name | text | 표시 이름 |
| role | text | 'owner' \| 'staff' |
| created_at | timestamptz | |

RLS: `authenticated` 역할은 전체 조회 가능(직원 목록을 UI에서 보여주기 위함), 본인 행만 수정 가능. 신규 계정 생성은 Supabase Auth Admin API로 관리자가 처리(자체 가입 폼 없음).

### 스펙에만 제안 (Phase 2에서 생성하지 않음 — 각 페이지 구현 시 확정)

각 페이지를 실제로 만들 때 이 구조를 다시 검토하고 확정한다. 지금은 전체 그림을 맞춰보기 위한 초안이다.

**`happy_call_patients`** (초진환자 해피콜)
- id, patient_name, phone, registered_at, first_visit_date, completed(bool), completed_at, completed_by(→staff), memo

**`treatment_timers`** (치료실 타이머)
- id, room_or_patient_label, started_at, ended_at(nullable — null이면 진행 중), started_by(→staff)

**`non_covered_patients`** (비급여 환자 목록)
- id, patient_name, procedure_name, amount, visit_date, event_id(nullable, →events — 이벤트 소속이면 여기에 연결되고 이 목록에서는 자동 제외)

**`events`** (이벤트 목록)
- id, name(예: "26가정의달", "26추석"), created_at, is_active

**`event_patients`** (이벤트별 환자)
- id, event_id(→events), patient_name, procedure_name, amount, visit_date

**`supply_requests`** (물품신청)
- id, item_name, requested_by(→staff), requested_at, note, purchased(bool), purchased_at, purchased_by(→staff)

**`sheet_notifications`** (구글시트 비대면진료 알람)
- id, row_snapshot(jsonb), detected_at, acknowledged(bool), acknowledged_by(→staff)
- 실제 구글시트 연동 방식(Apps Script 웹훅 vs 폴링)은 해당 페이지 브레인스토밍 때 결정

**`monthly_metrics`** (월별 매출/객단가/비급여 항목)
- id, month(YYYY-MM), total_revenue, avg_ticket_price, revenue_goal, avg_ticket_goal
- 비급여 항목별 매출은 별도 `monthly_non_covered_items` 테이블(month, item_name, amount)로 분리할 가능성 — 홈 위젯 페이지 브레인스토밍 때 확정

## 6. 화면 구성 (Phase 1)

- **레이아웃**: 좌측 사이드바(고정) + 우측 콘텐츠 영역
- **사이드바**: 클리닉명/로고, 9개 메뉴 항목(현재 페이지 강조), 로그인한 사용자 이름 표시 + 로그아웃
- **홈**: 9개 카드 그리드
  - 예약관리 → `https://kh-ondam-reservation.vercel.app` (새 탭)
  - 한약 복용법 출력 → `https://scratch-2026-09-09-c5228e.vercel.app` (새 탭)
  - 나머지 7개 → 이 프로젝트 내부 라우트, Phase 1에서는 "준비 중" 플레이스홀더만
- **로그인**: 이메일/비밀번호 폼, 실패 시 에러 메시지

## 7. 테스트 전략

- Phase 1+2는 레이아웃/인증/스키마 생성이 중심이라 자동화 테스트 대상이 적음
- 인증 게이트(미로그인 차단, 로그인 성공 후 접근)는 예약관리 앱 때처럼 curl로 직접 검증
- 각 하위 페이지에 실제 로직(파싱, 계산 등)이 생기면 그때 Vitest 유닛 테스트를 추가

## 8. 미해결 리스크

- 구글시트 연동 방식(Apps Script 웹훅 vs 폴링)은 아직 결정 안 됨 — 해당 페이지 브레인스토밍 때 사용자의 구글시트 접근 권한/Apps Script 사용 가능 여부를 확인해야 함
- 비급여 항목별 매출 구조(단일 jsonb vs 별도 테이블)는 홈 위젯 요구사항이 더 구체화되면 결정
