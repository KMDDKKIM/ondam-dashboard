# 경희온담한의원 운영 대시보드

예약관리·한약 복용법 출력 등 기존 도구를 한 곳에서 접근하고, 앞으로 해피콜·치료실 타이머·
비급여/이벤트 환자 관리·물품신청 등을 하나씩 추가해 나가는 내부 운영 대시보드.

## 로컬 실행

1. Supabase 프로젝트: 예약관리 앱(`kh-ondam-reservation`)과 같은 `hanyak-ondam` 프로젝트를 공유합니다(무료 티어 2개 제한 때문 — 별도 프로젝트를 새로 만들지 않습니다). 그 프로젝트의 SQL Editor에서 `supabase/schema.sql`을 실행합니다. 새 테이블을 추가할 때는 기존 테이블(`prescriptions`, `daily_records`, `reservations`, `monthly_goals`, `staff`)과 이름이 겹치지 않는지 먼저 확인하세요.
2. `.env.local.example`을 복사해 `.env.local`을 만들고 `hanyak-ondam`의 Project URL / anon public key를 채웁니다.
3. 최소 한 명의 원장 계정을 Supabase Auth에 만들고, `staff` 테이블에 같은 id로
   `role = 'owner'`, `grade = '대표원장'`, `status = 'approved'` 행을 추가합니다 (DB 제약상 owner 행은 등급이 반드시 대표원장이어야 하며, 앱 안에서는 가입 폼을 제공하지 않습니다).
4. 의존성 설치: `npm install`
5. 개발 서버 실행: `npm run dev` → `http://localhost:3000`

## 범위 (Phase 1 & 2)

좌측 사이드바 네비게이션 + 홈(9개 카드) + Supabase Auth 로그인 + `staff` 테이블.
7개 기능 페이지 중 **초진환자 해피콜**과 **해피콜 목록**은 구현 완료(아래 참고). 나머지
5개(치료실 타이머, 비급여 환자 목록, 이벤트 환자 목록, 비대면진료 알람, 물품신청)는
아직 "준비 중" 플레이스홀더만 있고, 각각 별도로 설계해서 하나씩 채워 나갈 예정입니다.

자세한 설계는 `docs/superpowers/specs/2026-09-17-ondam-dashboard-design.md` 참고.

## 해피콜 (초진환자 해피콜 + 해피콜 목록)

- **초진환자 해피콜**: 첫 방문 환자 입력/수정 + 주별·진료의별·환자구분별 재진율/이탈률/삼진율 통계.
- **해피콜 목록**: 오늘 전화해야 할 대상 통합 워크리스트 — 초진(수동 추가) + 한약 처방(수령일
  기준 자동 콜 일정 계산) + 린다이어트 패키지(디톡스 시작일 다음날부터 7일 매일 자동 생성,
  8일째 이후는 수동 추가).

자세한 설계는 `docs/superpowers/specs/2026-09-18-happy-call-design.md` 참고.

## 사내 채팅 (토픽 + 채팅방)

TopBar의 💬 아이콘(안읽음 배지 포함) → `/chat`. 토픽방(업무 기록용, 전체 공개)과
채팅방(자유 대화, 공개 또는 초대) 모두 지원하며 Supabase Realtime으로 실시간 갱신됩니다.
텍스트 + 파일 첨부, 전체 방 통합 검색 가능. 비공개방의 메시지는 초대된 사람만 DB
레벨(RLS)에서 조회 가능 — 초대 안 된 사람에게는 방 자체가 목록에도 뜨지 않습니다.

자세한 설계는 `docs/superpowers/specs/2026-09-18-team-chat-design.md` 참고.
