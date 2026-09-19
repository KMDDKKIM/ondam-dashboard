-- 직원 등급: 대표원장 / 부원장 / 팀장 / 사원.
-- staff.role(관리 권한 owner/staff)은 그대로 두고 등급을 별도 컬럼으로 둔다.
-- 순서가 중요하다: 컬럼 추가 → 대표원장 백필 → 제약 추가. 백필 전에 제약을
-- 걸면 기존 원장(role = 'owner') 행이 기본값 '사원'이라 제약에 걸려 실패한다.
alter table staff add column if not exists grade text not null default '사원'
  check (grade in ('대표원장', '부원장', '팀장', '사원'));

update staff set grade = '대표원장' where role = 'owner' and grade <> '대표원장';

-- 관리 권한(role)과 등급이 어긋나는 행을 DB가 거부한다:
-- 대표원장일 때만 role = 'owner'.
alter table staff drop constraint if exists staff_grade_matches_role;
alter table staff add constraint staff_grade_matches_role
  check ((role = 'owner') = (grade = '대표원장'));
