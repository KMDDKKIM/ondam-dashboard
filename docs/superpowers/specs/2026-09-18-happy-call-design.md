# 해피콜 (초진환자 해피콜 + 해피콜 목록) — 설계 문서

- 날짜: 2026-09-18
- 상태: 승인 대기
- 범위: `docs/superpowers/specs/2026-09-17-ondam-dashboard-design.md`에서 플레이스홀더로 남겨둔 2개 라우트, `/happy-call-register`(초진환자 해피콜)와 `/happy-call-list`(해피콜 목록)를 실제로 구현한다.

## 1. 배경 / 목적

한의원은 지금 두 가지 해피콜(첫 진료 후 안부 확인 전화)을 각각 다른 방식으로 운영하고 있다:

- **초진환자 해피콜**: 첫 방문 환자를 스프레드시트에 수동으로 기록하며, 재내원 여부(1진/2진/3진)와 자보약 처방 여부를 추적해 주별·진료의별 재진율/이탈률/삼진율 통계를 낸다.
- **한약·린다이어트 사후관리 콜**: 지금은 별도 추적 도구 없이 직원이 기억이나 개별 메모로 관리한다.

이번 작업은 이 두 흐름을 대시보드 안에 통합한다: 초진 쪽은 기존 시트 워크플로를 그대로 옮기고, 한약/린다이어트는 처방 기록만 입력하면 해피콜 대상일이 자동으로 계산되어 뜨도록 한다.

## 2. 범위

**포함**
- `/happy-call-register`: 초진환자 입력·수정 + 주별/진료의별/환자구분별 통계 대시보드
- `/happy-call-list`: 오늘 전화해야 할 대상 통합 목록 (초진 수동 추가 + 한약/린다이어트 자동 생성)
- 한약 처방 기록 입력 시 콜 예정일 자동 계산(수령일 기준), 예외 시 수동 수정 가능
- 린다이어트 패키지 입력 시 7일간 매일 콜 자동 생성, 이후 수동 추가

**이번 범위 아님**
- SMS/알림 발송 — 이 기능은 "누구에게 전화해야 하는지"만 추적하며, 실제 발신/문자는 하지 않는다
- 한약/린다이어트에 대한 이탈률/삼진율 같은 통계 대시보드 — 워크리스트만 제공, 통계는 초진에만 있음
- 기존 구글시트의 과거 데이터 마이그레이션 — 테이블은 빈 상태로 시작, 필요 시 나중에 엑셀로 별도 처리(이번 스펙에 포함 안 됨)
- `staff.role` 기반 권한 제한(원장 전용 기능 등) — Phase 1+2와 동일하게 YAGNI로 미룸

## 3. 기술 스택

Phase 1+2와 동일한 스택을 그대로 사용한다: Next.js(App Router) + TypeScript, Supabase(Auth + Postgres), 공유 `hanyak-ondam` 프로젝트(anon key + RLS). 새 테이블을 추가하기 전에 기존 테이블(`prescriptions`, `daily_records`, `reservations`, `monthly_goals`, `staff`)과 이름이 겹치지 않는지 반드시 확인한다(2026-09-17 스펙 §3에서 정한 규칙).

## 4. 데이터 모델

### `happy_call_patients` (초진환자 해피콜)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | |
| patient_name | text, not null | 성함 |
| doctor_staff_id | uuid, references staff(id) | 진료의 |
| patient_type | text, check in ('건보','자보','비급여') | 환자구분 |
| acupuncture_package_success | text, check in ('성공','실패'), nullable | 약침패키지 성공여부 |
| first_visit_date | date, not null | 초진일 |
| revisit_1 / revisit_2 / revisit_3 | date, nullable | 재내원 1진/2진/3진 |
| jabo_herb_1 / jabo_herb_2 / jabo_herb_3 | date, nullable | 자보약처방 1차/2차/3차 (환자구분이 '자보'인 경우에만 의미 있음, DB 레벨 제약은 걸지 않음) |
| next_visit_note | text, nullable | 환자 다음 내원일/내원간격/예후 고지 내용 (자유 텍스트) |
| call_log | text, nullable | 해피콜 통화내역 |
| memo | text, nullable | |
| created_by | uuid, references staff(id) | |
| created_at | timestamptz, not null, default now() | |

RLS: `authenticated`는 전체 조회/입력/수정 가능(접수 데스크 운영 데이터, 원장 전용 제한 없음 — §2 참고).

### `herb_medicine_prescriptions` (한약 처방 — 해피콜 목록 자동 생성용)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | |
| patient_name | text, not null | |
| pickup_date | date, not null | 한약 수령일 |
| duration_days | smallint, not null | 처방 기간(일수) |
| call_date_1 | date, not null | 수령일+1 (첫콜), 입력 시 자동 계산되지만 수동 수정 가능 |
| call_date_2 | date, not null | 수령일+floor(기간/2) (중간상담) |
| call_date_3 | date, not null | 수령일+기간-3 (마감 3일 전) |
| call_1_done / call_2_done / call_3_done | boolean, not null, default false | |
| call_1_note / call_2_note / call_3_note | text, nullable | |
| created_by | uuid, references staff(id) | |
| created_at | timestamptz, not null, default now() | |

RLS: `authenticated` 전체 조회/입력/수정 가능.

### `diet_packages` + `diet_package_calls` (린다이어트 — 해피콜 목록 자동 생성용)

**`diet_packages`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | |
| patient_name | text, not null | |
| start_date | date, not null | 처방(시작)일 |
| created_by | uuid, references staff(id) | |
| created_at | timestamptz, not null, default now() | |

**`diet_package_calls`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | |
| package_id | uuid, references diet_packages(id) on delete cascade | |
| call_date | date, not null | |
| done | boolean, not null, default false | |
| note | text, nullable | |
| unique(package_id, call_date) | | 같은 패키지에 같은 날짜 중복 방지 |

패키지 생성 시 `start_date + 1`부터 `start_date + 7`까지 7개 행을 앱에서 자동 생성한다(수령 다음날부터 7일 매일, 한약 규칙과 동일한 "다음날 시작" 패턴). 8일째부터는 직원이 이 화면에서 직접 행을 추가한다.

RLS: `authenticated` 전체 조회/입력/수정 가능. `diet_package_calls`도 동일.

### `happy_call_manual_entries` (해피콜 목록 — 초진 수동 추가분)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | |
| patient_name | text, not null | |
| note | text, nullable | |
| call_date | date, not null | |
| done | boolean, not null, default false | |
| done_note | text, nullable | |
| created_by | uuid, references staff(id) | |
| created_at | timestamptz, not null, default now() | |

RLS: `authenticated` 전체 조회/입력/수정 가능.

## 5. 페이지 동작

### `/happy-call-register` — 초진환자 해피콜

- **입력/수정**: 새 초진환자 추가 폼(성함/진료의/환자구분/초진일), 목록에서 재내원1/2/3·자보약처방1/2/3·약침패키지 성공여부·다음내원 메모·통화내역·메모를 인라인 수정
- **필터**: 진료의 선택 드롭다운, 기준일(주) 선택 — 기존 시트와 동일한 조작감
- **통계 대시보드**: 주별/진료의별/환자구분별 초진환자수·재진율·이탈률·삼진율 + 한의원 전체 통계

### `/happy-call-list` — 해피콜 목록 (통합 워크리스트)

오늘(KST) 기준으로, 완료되지 않았고 예정일이 오늘이거나 지난 항목을 모두 모아 보여준다(별도의 "이월" 로직 없이 "미완료 + 예정일 ≤ 오늘" 조건만으로 자연스럽게 다음날까지 계속 노출됨):

- `herb_medicine_prescriptions`: `call_date_1/2/3 <= 오늘` AND 해당 `call_N_done = false`
- `diet_package_calls`: `call_date <= 오늘` AND `done = false`
- `happy_call_manual_entries`: `call_date <= 오늘` AND `done = false`

각 행은 환자명/유형(초진·한약·린다이어트)/예정일(연체 시 강조 표시)/완료 체크박스+메모 입력으로 구성. 초진 환자를 이 목록에 추가하는 것은 `/happy-call-register`가 아니라 이 페이지에서 직원이 직접 한다(환자명/메모/콜 예정일 입력).

## 6. 계산 로직

### 초진 통계 (재진율/이탈률/삼진율)

- **모수(초진환자수)**: 해당 기간(주)에 `first_visit_date`가 속하는 환자 전체
- **재진율**: 재내원(`revisit_1` 이상)이 하나라도 있는 환자 비율
- **성숙 조건**: `first_visit_date`로부터 **3주 이상 경과**한 환자만 이탈률/삼진율 계산에 포함 (3주 미만인 환자는 "아직 판단 이르다"로 제외 — 초진환자수 집계에는 포함되지만 이탈/삼진 판정에서는 제외)
- **이탈률**: 성숙 조건을 만족하는 환자 중, 재내원이 하나도 없는 비율
- **삼진율**: 성숙 조건을 만족하는 환자 중, `revisit_1`/`revisit_2`/`revisit_3`가 모두 채워진 비율

### 한약 콜 예정일 계산

`duration_days`를 기준으로 세 콜 날짜를 자동 계산(입력 시 기본값으로 채워지며, 이후 개별 수정 가능):

- `call_date_1` = `pickup_date + 1`
- `call_date_2` = `pickup_date + floor(duration_days / 2)`
- `call_date_3` = `pickup_date + duration_days - 3`

15일치/30일치 외의 모든 기간에 동일한 공식을 적용한다(사용자 확인 완료).

### 린다이어트 콜 자동 생성

패키지 생성 시 `start_date + 1`부터 `start_date + 7`까지 7개의 `diet_package_calls` 행을 자동 생성. 8일째 이후는 자동 생성하지 않으며, 필요 시 직원이 직접 행을 추가한다.

## 7. 테스트 전략

Phase 1+2와 달리 이번에는 실제 계산 로직이 있으므로 Vitest 단위 테스트를 추가한다:

- 이탈률/재진율/삼진율 계산 함수 (3주 성숙 조건 포함 경계값 테스트)
- 한약 콜 예정일 계산 함수 (15일/30일 외 기간 포함)
- 린다이어트 7일 콜 자동 생성 함수

CRUD 동작과 RLS는 Phase 1+2와 동일하게 브라우저로 직접 검증한다(자동화 테스트 대상 아님).

## 8. 미해결 리스크 / 확인 필요 사항

- 린다이어트 "처방 후 7일간 매일"이 **처방 당일**부터가 아니라 **다음날부터**(한약과 동일 패턴)라고 가정했다 — 브레인스토밍 중 이 부분은 명시적으로 재확인받지 못했으므로, 구현 계획 단계에서 다시 한 번 확인한다.
- `jabo_herb_1/2/3`는 환자구분이 '자보'가 아닌 환자에게도 DB상으로는 입력 가능하다(제약 없음) — 실수 입력을 막을 필요가 있는지는 실제 사용해보고 판단(YAGNI).
- 향후 한약/린다이어트에도 이탈률류 통계가 필요해지면 별도 스펙으로 다룬다(§2에서 이번 범위 아님으로 명시).
- 한약 기간이 매우 짧으면(`duration_days` ≤ 3) `call_date_3`(수령일+기간-3) 공식이 수령일보다 앞선 날짜를 계산할 수 있다. 실제로 이렇게 짧은 처방은 없을 것으로 보이지만, 구현 시 `call_date_3`이 `call_date_1`보다 빠르면 `call_date_1`과 같은 날로 보정하는 안전장치를 넣는다.
