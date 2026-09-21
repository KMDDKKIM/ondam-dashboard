# 경희온담한의원 운영 대시보드

예약관리·한약 복용법 출력 등 기존 도구를 한 곳에서 접근하고, 해피콜·비급여 관리·물품신청 등을
하나씩 추가해 온 내부 운영 대시보드.

## 로컬 실행

1. Supabase 프로젝트: 예약관리 앱(`kh-ondam-reservation`)과 같은 `hanyak-ondam` 프로젝트를 공유합니다(무료 티어 2개 제한 때문 — 별도 프로젝트를 새로 만들지 않습니다). 그 프로젝트의 SQL Editor에서 `supabase/schema.sql`을 실행한 뒤, 아래 「DB 마이그레이션」의 `supabase/migration_*.sql` 파일을 순서대로 모두 실행합니다(일부 표는 마이그레이션에만 있습니다). 새 테이블을 추가할 때는 기존 테이블(`prescriptions`, `daily_records`, `reservations`, `monthly_goals`, `staff`)과 이름이 겹치지 않는지 먼저 확인하세요.
2. `.env.local.example`을 복사해 `.env.local`을 만들고 `hanyak-ondam`의 Project URL / anon public key를 채웁니다. 서버 전용 값(`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, 비대면진료용 두 값)은 이름에 `NEXT_PUBLIC_`을 붙이지 않고, 저장소에 올리지 않습니다. 배포할 때 넣을 값은 `docs/배포-안내.md`를 보세요.
3. 대표원장 계정은 처음에 한 번만 직접 만듭니다. Supabase Auth에 계정을 만들고, `staff` 테이블에 같은 id로
   `role = 'owner'`, `status = 'approved'`, `grade = '대표원장'` 행을 추가합니다 (DB 제약상 owner 행은 등급이 반드시 대표원장이어야 합니다). 나머지 직원은 아래 「직원 가입 · 승인 · 삭제」로 들어옵니다.
4. 의존성 설치: `npm install`
5. 개발 서버 실행: `npm run dev` → `http://localhost:3000`
6. 확인: `npx tsc --noEmit`, `npx vitest run`, `npm run build`

## 직원 가입 · 승인 · 삭제

- **가입**: 직원이 로그인 화면의 가입 링크(`/signup`)에서 스스로 신청합니다. 신청 직후에는 「승인 대기」 화면만 보이고 다른 화면은 열리지 않습니다.
- **승인**: 대표원장이 왼쪽 메뉴 「직원 승인」에서 등급(부원장 · 팀장 · 사원)을 골라 승인합니다. 승인된 직원의 등급은 나중에 그 화면에서 바꿀 수 있고, 이름 옆(상단 바)에 등급이 표시됩니다.
- **삭제(퇴사)**: 같은 화면에서 대표원장이 직원을 삭제합니다. 그 직원이 남긴 기록(상담 차팅, 해피콜 등)은 지워지지 않고, 작성자 칸만 비워집니다.
- **등급별 차이**: 상담 녹음 차팅은 대표원장·부원장만 쓸 수 있고(메뉴·화면·API·DB 모두), 「직원 승인」과 「백업 내려받기」는 대표원장만 볼 수 있습니다. 매출·목표는 모든 직원이 봅니다.

## 왼쪽 메뉴

| 묶음 | 메뉴 |
|---|---|
| (맨 위) | 오늘, 일일결산 |
| 진료 | 예약관리, 접수기록부, 초진환자 해피콜, 해피콜 목록, 비대면진료 신청, 상담 녹음 차팅(대표원장·부원장) |
| 한약 | 한약 대기방, 한약 복용법 출력, 한약재 재고 현황 |
| 매출 | 비급여 현황 |
| 운영 | 물품신청, 채팅, 직원 승인(대표원장), 백업 내려받기(대표원장) |

메뉴 목록은 `src/lib/navItems.ts` 한 곳에서 고칩니다.

## 해피콜 (초진환자 해피콜 + 해피콜 목록)

- **초진환자 해피콜**: 첫 방문 환자 입력/수정 + 주별·진료의별·환자구분별 재진율/이탈률/삼진율 통계.
- **해피콜 목록**: 오늘 전화해야 할 대상 통합 워크리스트 — 초진 + 한약 처방(수령일
  기준 자동 콜 일정 계산) + 린다이어트 패키지 + 비급여 구매 후 콜(수동 추가 포함).

자세한 설계는 `docs/superpowers/specs/2026-09-18-happy-call-design.md` 참고.

## 사내 채팅 (토픽 + 채팅방)

TopBar의 💬 아이콘(안읽음 배지 포함) → `/chat`. 토픽방(업무 기록용, 전체 공개)과
채팅방(자유 대화, 공개 또는 초대) 모두 지원하며 Supabase Realtime으로 실시간 갱신됩니다.
텍스트 + 파일 첨부, 전체 방 통합 검색 가능. 비공개방의 메시지는 초대된 사람만 DB
레벨(RLS)에서 조회 가능 — 초대 안 된 사람에게는 방 자체가 목록에도 뜨지 않습니다.

자세한 설계는 `docs/superpowers/specs/2026-09-18-team-chat-design.md` 참고.

## 상담 녹음 차팅

원장님(대표원장·부원장)이 상담 녹음 내용을 붙여넣으면 AI가 차팅 형식으로 정리합니다.

- 한 번에 넣을 수 있는 글자 수는 30,000자까지, 직원 한 명이 하루(한국 시간 0시 기준)에 AI로 만들 수 있는 차팅은 60건까지입니다(저장 여부와 상관없이 '차팅 생성'을 누른 횟수를 세며, 기록은 `consult_usage` 테이블에 남습니다 — `supabase/migration_consult_usage.sql` 적용 필요).
- **상담 기록은 10년 보관**합니다. 저장된 원문·요약은 화면에서 읽기만 할 수 있고, 삭제 기능도 자동 삭제도 없습니다. 직원을 삭제해도 기록은 남습니다.
- 서버 전용 `ANTHROPIC_API_KEY`가 필요합니다.

## 백업

무료 요금제라 Supabase 자동 백업이 없습니다. 대표원장은 왼쪽 메뉴 「백업 내려받기」(`/backup`)에서 **주 1회 이상** CSV를 내려받아 안전한 곳(암호를 건 저장소 등)에 보관하세요.

- 자료: 예약 명단(월), 일일 결산(월), 초진 해피콜, 비급여 구매(월), 상담 요약(월, 원문 포함), 한약재 재고, 물품신청, 접수기록부(월).
- 엑셀에서 한글이 깨지지 않도록 UTF-8(BOM) CSV로 내려받습니다. 환자 이름·연락처가 들어 있으니 보관에 주의하세요. 주민등록번호(비대면진료 신청)는 백업에 포함하지 않습니다.
- 대표원장만 사용할 수 있으며, 서버(`GET /api/export`)가 매번 대표원장 여부를 다시 확인합니다.

## DB 마이그레이션

`supabase/schema.sql`만으로는 전체 구조가 만들어지지 않습니다. 접수기록부·한약 대기방·일일결산 환자 목록·내원 이력·비대면진료 신청 등 일부 표는 마이그레이션 파일에만 들어 있습니다. 그래서 새 DB는 **`schema.sql`을 먼저 실행한 뒤, 아래 `supabase/migration_*.sql` 전부를 위에서 아래 순서로** 실행하세요. 이미 운영 중인 DB에는 아직 실행하지 않은 것만 실행하면 됩니다(모두 여러 번 실행해도 안전합니다). `migration_rls_approved_only.sql`이 먼저 있어야 이후 파일들이 쓰는 `is_approved_staff()`가 생기고, `migration_staff_grade.sql`은 상담 차팅 제한 파일보다 먼저여야 합니다.

1. `migration_supply_requests.sql`
2. `migration_herb_inventory_delete.sql`
3. `migration_settlement_visits.sql`
4. `migration_revenue_goals.sql`
5. `migration_non_covered_products.sql`
6. `migration_daily_closing.sql`
7. `migration_staff_grade.sql`
8. `migration_staff_removal.sql`
9. `migration_rls_approved_only.sql`
10. `migration_happy_call_results.sql`
11. `migration_happy_call_first_visit.sql`
12. `migration_replace_reservations_rpc.sql`
13. `migration_override_as_of.sql`
14. `migration_herb_inventory_v2.sql`
15. `migration_manual_entries_delete.sql`
16. `migration_manual_call_types.sql`
17. `migration_prescriptions_lock.sql`
18. `migration_remote_consult.sql`
19. `migration_doctors.sql`
20. `migration_reception_records.sql`
21. `migration_daily_visits.sql`
22. `migration_patient_visit_history.sql`
23. `migration_herb_queue.sql`
24. `migration_consult_summary_doctors_only.sql`

새 마이그레이션 파일을 만들면 이 목록 맨 아래에 추가하세요.

## 배포

Vercel(서울 리전) 배포 절차와 환경 변수는 `docs/배포-안내.md`를 보세요. 모든 응답에 기본 보안 헤더(`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`)가 붙습니다(`next.config.mjs`).

## 개발 메모

- 날짜는 서버/브라우저 시간대와 상관없이 한국 시간으로 계산합니다(`src/lib/kst.ts`).
- 확인 창은 `window.confirm` 대신 화면 안 대화상자(`confirmDialog`)를 씁니다.
- 자세한 초기 설계는 `docs/superpowers/specs/2026-09-17-ondam-dashboard-design.md` 참고.
