# 경희온담한의원 운영 대시보드

예약관리·한약 복용법 출력 등 기존 도구를 한 곳에서 접근하고, 앞으로 해피콜·치료실 타이머·
비급여/이벤트 환자 관리·물품신청 등을 하나씩 추가해 나가는 내부 운영 대시보드.

## 로컬 실행

1. Supabase 프로젝트를 만들고 `supabase/schema.sql`을 SQL Editor에서 실행합니다.
2. `.env.local.example`을 복사해 `.env.local`을 만들고 Project URL / anon public key를 채웁니다.
3. 최소 한 명의 원장 계정을 Supabase Auth에 만들고, `staff` 테이블에 같은 id로
   `role = 'owner'` 행을 추가합니다 (앱 안에서는 가입 폼을 제공하지 않습니다).
4. 의존성 설치: `npm install`
5. 개발 서버 실행: `npm run dev` → `http://localhost:3000`

## 범위 (Phase 1 & 2)

좌측 사이드바 네비게이션 + 홈(9개 카드) + Supabase Auth 로그인 + `staff` 테이블.
7개 기능 페이지(초진환자 해피콜, 치료실 타이머, 해피콜 목록, 비급여 환자 목록,
이벤트 환자 목록, 비대면진료 알람, 물품신청)는 아직 "준비 중" 플레이스홀더만 있고,
각각 별도로 설계해서 하나씩 채워 나갈 예정입니다.

자세한 설계는 `docs/superpowers/specs/2026-09-17-ondam-dashboard-design.md` 참고.
