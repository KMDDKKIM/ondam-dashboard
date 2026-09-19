# 직원 등급 (대표원장 / 부원장 / 팀장 / 사원) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가입 승인된 직원에게 등급(대표원장/부원장/팀장/사원)을 지정·변경할 수 있게 한다. 승인할 때 등급을 고르고, 이후에도 대표원장이 바꿀 수 있다. 화면별 열람 제한은 이번 범위가 아니다.

**Architecture:** `staff.role`(관리 권한 owner/staff)은 그대로 두고 `staff.grade` 컬럼을 추가한다. DB 제약 `(role = 'owner') = (grade = '대표원장')`으로 둘이 어긋나지 않게 한다. 등급 변경은 대표원장만 호출할 수 있는 서버 API(service_role)로만 한다. 등급 순서·판정은 순수 함수 모듈(`staffGrade.ts`)에 두고 Vitest로 검증한다.

**Tech Stack:** Next.js(App Router), TypeScript, Supabase(Postgres + Auth), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-staff-grade-design.md`

## Global Constraints

- 지정 가능한 등급은 **부원장 / 팀장 / 사원** 세 가지뿐이다. `대표원장`은 화면·API 어디에서도 지정하거나 해제할 수 없다.
- 등급 변경·승인 API는 **로그인된 승인 완료 `role = 'owner'` 계정만** 호출할 수 있다. 검사는 서버에서 anon(RLS) 클라이언트로 요청자를 확인한 뒤에만 service_role을 쓴다.
- 일반 계정이 `grade`를 직접 바꾸는 경로가 생기면 안 된다. `staff`의 컬럼 단위 grant(`grant update (name)`)를 건드리지 않는다.
- 기존 `role === 'owner'` 검사와 RLS 정책, `/api/signup`은 수정하지 않는다.
- 스타일은 `globals.css`의 공용 클래스(`.card`, `.btn-primary`, `.input-field`, `.muted-text`, `.error-text`)와 CSS 변수를 쓴다. CSS 프레임워크는 쓰지 않는다.
- 마이그레이션은 idempotent여야 한다. 순서는 **컬럼 추가 → 대표원장 백필 → 제약 추가**.
- `role = 'owner'` 계정을 직접 만드는 스크립트(시드·테스트용)는 제약이 생긴 뒤 `grade: '대표원장'`을 함께 넣어야 한다.
- 이 기능은 실제 공유 DB(`hanyak-ondam`)에 마이그레이션을 적용해야 동작한다. 적용은 컨트롤러가 사용자 확인을 받은 뒤 직접 한다(서브에이전트 금지).

## Prerequisites

- 채팅 새 창 변경(`feat/chat-popup` 브랜치, `TopBar.tsx`를 수정함)이 `master`에 병합되어 있는 편이 좋다. 이 계획의 Task 5도 `TopBar.tsx`를 수정하므로, 병합 전이면 충돌할 수 있다(수정 위치가 달라 대부분 자동 병합된다).
- 새 npm 패키지는 필요 없다.

---

### Task 1: 등급 순수 함수 모듈 + 단위 테스트

**Files:**
- Create: `src/lib/staffGrade.ts`
- Test: `src/lib/staffGrade.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `GRADES`, `StaffGrade`, `ASSIGNABLE_GRADES`, `AssignableGrade`, `DEFAULT_GRADE`, `isStaffGrade(value)`, `isAssignableGrade(value)`, `gradeAtLeast(grade, min)` — Task 3(API), Task 4(승인 화면)가 이 이름 그대로 가져다 쓴다. `gradeAtLeast`는 이번에 어디서도 쓰지 않는다(나중 열람 제한용, 테스트로만 검증).

- [ ] **Step 1: `src/lib/staffGrade.ts` 작성**

```ts
// 높은 등급이 앞에 온다. gradeAtLeast가 이 순서를 그대로 쓴다.
export const GRADES = ['대표원장', '부원장', '팀장', '사원'] as const;
export type StaffGrade = (typeof GRADES)[number];

// 화면·API에서 지정할 수 있는 등급. 대표원장은 지정하지 않는다.
export const ASSIGNABLE_GRADES = ['부원장', '팀장', '사원'] as const;
export type AssignableGrade = (typeof ASSIGNABLE_GRADES)[number];

export const DEFAULT_GRADE: AssignableGrade = '사원';

export function isStaffGrade(value: unknown): value is StaffGrade {
  return typeof value === 'string' && (GRADES as readonly string[]).includes(value);
}

export function isAssignableGrade(value: unknown): value is AssignableGrade {
  return typeof value === 'string' && (ASSIGNABLE_GRADES as readonly string[]).includes(value);
}

// grade가 min과 같거나 더 높은 등급인지. 예: gradeAtLeast('팀장', '팀장') === true,
// gradeAtLeast('사원', '팀장') === false.
export function gradeAtLeast(grade: StaffGrade, min: StaffGrade): boolean {
  return GRADES.indexOf(grade) <= GRADES.indexOf(min);
}
```

- [ ] **Step 2: `src/lib/staffGrade.test.ts` 작성**

```ts
import { describe, expect, it } from 'vitest';
import {
  ASSIGNABLE_GRADES,
  DEFAULT_GRADE,
  GRADES,
  gradeAtLeast,
  isAssignableGrade,
  isStaffGrade,
} from './staffGrade';

describe('GRADES', () => {
  it('높은 등급부터 대표원장 > 부원장 > 팀장 > 사원 순서다', () => {
    expect([...GRADES]).toEqual(['대표원장', '부원장', '팀장', '사원']);
  });

  it('지정 가능한 등급에는 대표원장이 없다', () => {
    expect([...ASSIGNABLE_GRADES]).toEqual(['부원장', '팀장', '사원']);
    expect(DEFAULT_GRADE).toBe('사원');
  });
});

describe('isStaffGrade / isAssignableGrade', () => {
  it('알려진 등급만 통과시킨다', () => {
    expect(isStaffGrade('대표원장')).toBe(true);
    expect(isStaffGrade('원장')).toBe(false);
    expect(isStaffGrade(undefined)).toBe(false);
    expect(isStaffGrade(3)).toBe(false);
  });

  it('대표원장은 지정할 수 없다', () => {
    expect(isAssignableGrade('부원장')).toBe(true);
    expect(isAssignableGrade('팀장')).toBe(true);
    expect(isAssignableGrade('사원')).toBe(true);
    expect(isAssignableGrade('대표원장')).toBe(false);
    expect(isAssignableGrade('')).toBe(false);
    expect(isAssignableGrade(null)).toBe(false);
  });
});

describe('gradeAtLeast', () => {
  it('같은 등급이면 true', () => {
    expect(gradeAtLeast('팀장', '팀장')).toBe(true);
  });

  it('더 높은 등급이면 true, 더 낮으면 false', () => {
    expect(gradeAtLeast('부원장', '팀장')).toBe(true);
    expect(gradeAtLeast('사원', '팀장')).toBe(false);
  });

  it('최상·최하 경계', () => {
    expect(gradeAtLeast('대표원장', '대표원장')).toBe(true);
    expect(gradeAtLeast('부원장', '대표원장')).toBe(false);
    expect(gradeAtLeast('대표원장', '사원')).toBe(true);
    expect(gradeAtLeast('사원', '사원')).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `npm run test`
Expected: 새 테스트를 포함해 전체 PASS.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/staffGrade.ts src/lib/staffGrade.test.ts
git commit -m "feat: add staff grade helpers with unit tests"
```

---

### Task 2: DB 마이그레이션 + schema.sql

**Files:**
- Create: `supabase/migration_staff_grade.sql`
- Modify: `supabase/schema.sql`

**Interfaces:**
- Consumes: 기존 `staff` 테이블(`role`, `status` 컬럼)
- Produces: `staff.grade` 컬럼과 제약 `staff_grade_matches_role`. Task 3~5가 이 컬럼을 읽고 쓴다.

- [ ] **Step 1: `supabase/migration_staff_grade.sql` 작성**

```sql
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
```

- [ ] **Step 2: `supabase/schema.sql`에 같은 내용 반영**

`supabase/schema.sql`에서 아래 줄 바로 뒤(빈 줄 하나 두고)에 Step 1의 SQL 전체를 그대로 붙여 넣는다:

```sql
update staff set status = 'approved' where role = 'owner' and status <> 'approved';
```

그 아래의 `alter table staff enable row level security;` 등 기존 내용은 그대로 둔다. 기존 정책·컬럼 grant(`grant update (name) on staff to authenticated;`)는 수정하지 않는다 — `grade`가 그 목록에 없어서 일반 계정이 직접 올릴 수 없다는 점이 보안의 전제다.

- [ ] **Step 3: 파일만 확인**

Run: `git diff --stat`
Expected: `supabase/migration_staff_grade.sql`(신규)와 `supabase/schema.sql`(추가만, 삭제 없음)만 나온다. **DB에는 아직 적용하지 않는다**(Task 6, 컨트롤러 전용).

- [ ] **Step 4: 커밋**

```bash
git add supabase/migration_staff_grade.sql supabase/schema.sql
git commit -m "feat: add staff.grade column with role/grade consistency constraint"
```

---

### Task 3: 대표원장 확인 헬퍼 + 승인 API 등급 지정 + 등급 변경 API

**Files:**
- Create: `src/lib/supabase/requireOwner.ts`
- Modify: `src/app/api/staff/approve/route.ts`
- Create: `src/app/api/staff/grade/route.ts`

**Interfaces:**
- Consumes: `isAssignableGrade`, `DEFAULT_GRADE`(Task 1), `createAdminClient`(기존 `@/lib/supabase/admin`), `createClient`(기존 `@/lib/supabase/server`)
- Produces: `requireOwner()`, `POST /api/staff/approve`(본문 `{ staffId, grade? }`), `POST /api/staff/grade`(본문 `{ staffId, grade }`). Task 4의 승인 화면이 두 API를 호출한다.

- [ ] **Step 1: `src/lib/supabase/requireOwner.ts` 작성**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// service_role로 다른 사람의 staff 행을 바꾸는 API 라우트 맨 앞에서 부른다.
// 로그인된 승인 완료 원장(role = 'owner')이 아니면 바로 돌려줄 에러 응답을
// 반환하고, 통과하면 null을 반환한다. 요청자 확인은 RLS가 적용되는 일반
// 클라이언트로 하므로 service_role을 쓰기 전에 반드시 이 검사를 거친다.
export async function requireOwner(): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from('staff')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();
  if (requester?.role !== 'owner' || requester.status !== 'approved') {
    return NextResponse.json({ error: '대표원장만 사용할 수 있습니다.' }, { status: 403 });
  }
  return null;
}
```

- [ ] **Step 2: `src/app/api/staff/approve/route.ts`를 아래 내용으로 교체**

```ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { DEFAULT_GRADE, isAssignableGrade } from '@/lib/staffGrade';

export async function POST(request: Request) {
  // service_role로 아무 staff 행이나 바꿀 수 있는 라우트이므로, 본문을 읽기 전에
  // 요청자가 실제로 로그인된 대표원장인지부터 검사한다.
  const denied = await requireOwner();
  if (denied) return denied;

  const { staffId, grade } = (await request.json()) as { staffId?: string; grade?: unknown };
  if (!staffId) {
    return NextResponse.json({ error: 'staffId가 필요합니다.' }, { status: 400 });
  }

  // 등급을 안 보내면 기본값(사원). 보냈는데 지정할 수 없는 값(대표원장 포함)이면 거부한다.
  const finalGrade = grade === undefined ? DEFAULT_GRADE : grade;
  if (!isAssignableGrade(finalGrade)) {
    return NextResponse.json({ error: '지정할 수 없는 등급입니다.' }, { status: 400 });
  }

  // role = 'staff' 조건: 원장 계정 행은 이 API로 바꾸지 못하게 한다.
  const admin = createAdminClient();
  const { error } = await admin
    .from('staff')
    .update({ status: 'approved', grade: finalGrade })
    .eq('id', staffId)
    .eq('role', 'staff');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: `src/app/api/staff/grade/route.ts` 작성**

```ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { isAssignableGrade } from '@/lib/staffGrade';

export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { staffId, grade } = (await request.json()) as { staffId?: string; grade?: unknown };
  if (!staffId || !isAssignableGrade(grade)) {
    return NextResponse.json({ error: 'staffId와 지정 가능한 등급이 필요합니다.' }, { status: 400 });
  }

  // role = 'staff' + status = 'approved'로 좁혀서, 대표원장 행이나 승인 전 계정은
  // 바꾸지 못하게 한다. 조건에 맞는 행이 없으면 갱신된 행이 0개다.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('staff')
    .update({ grade })
    .eq('id', staffId)
    .eq('role', 'staff')
    .eq('status', 'approved')
    .select('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: '등급을 바꿀 수 있는 직원이 아닙니다.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: 타입·빌드 확인**

Run: `npm run build`
Expected: succeeds, 라우트 목록에 `/api/staff/grade`가 추가된다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/supabase/requireOwner.ts src/app/api/staff/approve/route.ts src/app/api/staff/grade/route.ts
git commit -m "feat: assign staff grade on approval and add owner-only grade change API"
```

---

### Task 4: 직원 승인 화면에 등급 선택 추가

**Files:**
- Modify: `src/app/(app)/staff-approval/page.tsx`

**Interfaces:**
- Consumes: `ASSIGNABLE_GRADES`, `DEFAULT_GRADE`, `AssignableGrade`, `StaffGrade`(Task 1), `POST /api/staff/approve`·`POST /api/staff/grade`(Task 3)
- Produces: 없음(마지막 화면 작업).

이 파일은 아래 8곳만 고친다. 각 항목은 "찾을 텍스트 → 바꿀 텍스트"이고, 그 외 부분(보안 확인, 로딩 처리, 레이아웃)은 건드리지 않는다.

- [ ] **Step 1: import 추가** — `import type { Staff } from '@/lib/types';` 바로 아래에 한 줄 추가:

```tsx
import { ASSIGNABLE_GRADES, DEFAULT_GRADE, type AssignableGrade, type StaffGrade } from '@/lib/staffGrade';
```

- [ ] **Step 2: `StaffRow`에 등급 추가**

```tsx
interface StaffRow extends Staff {
  status: 'pending' | 'approved';
}
```
를 아래로 교체:
```tsx
interface StaffRow extends Staff {
  status: 'pending' | 'approved';
  grade: StaffGrade;
}
```

- [ ] **Step 3: 조회에 `grade` 포함** — `.select('id, name, role, status')`를 `.select('id, name, role, status, grade')`로 교체.

- [ ] **Step 4: 승인 대기 행의 등급 선택 상태 추가** — `const [approvingId, setApprovingId] = useState<string | null>(null);` 바로 아래에 추가:

```tsx
  const [pendingGrades, setPendingGrades] = useState<Record<string, AssignableGrade>>({});
  const [changingId, setChangingId] = useState<string | null>(null);
```

- [ ] **Step 5: 승인 요청에 등급 포함** — `body: JSON.stringify({ staffId }),`를 아래로 교체:

```tsx
        body: JSON.stringify({ staffId, grade: pendingGrades[staffId] ?? DEFAULT_GRADE }),
```

- [ ] **Step 6: 등급 변경 함수 추가** — `handleApprove` 함수가 끝나는 `}` 다음, `if (loading) return` 줄 앞에 추가:

```tsx
  async function handleGradeChange(staffId: string, grade: AssignableGrade) {
    setChangingId(staffId);
    setError('');
    try {
      const response = await fetch('/api/staff/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, grade }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? '등급을 바꾸지 못했습니다.');
        return;
      }
      await load();
    } finally {
      setChangingId(null);
    }
  }
```

- [ ] **Step 7: 승인 대기 행에 등급 선택 추가** — 승인 대기 목록의 `<button onClick={() => handleApprove(s.id)}` 바로 앞에 추가:

```tsx
                <select
                  className="input-field"
                  value={pendingGrades[s.id] ?? DEFAULT_GRADE}
                  onChange={(event) =>
                    setPendingGrades((prev) => ({ ...prev, [s.id]: event.target.value as AssignableGrade }))
                  }
                  style={{ width: 100, padding: '6px 10px' }}
                  aria-label={`${s.name} 등급`}
                >
                  {ASSIGNABLE_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
```

- [ ] **Step 8: 사용 중인 계정 목록에 등급 표시/변경** — `<span className="muted-text">{s.role === 'owner' ? '원장' : '직원'}</span>`를 아래로 교체(대표원장 행은 드롭다운 없이 텍스트만):

```tsx
              {s.role === 'owner' ? (
                <span className="muted-text">대표원장</span>
              ) : (
                <select
                  className="input-field"
                  value={s.grade}
                  disabled={changingId === s.id}
                  onChange={(event) => handleGradeChange(s.id, event.target.value as AssignableGrade)}
                  style={{ width: 100, padding: '6px 10px' }}
                  aria-label={`${s.name} 등급`}
                >
                  {ASSIGNABLE_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}
```

- [ ] **Step 9: 타입·빌드 확인**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 10: 커밋**

```bash
git add "src/app/(app)/staff-approval/page.tsx"
git commit -m "feat: choose staff grade on approval and change it later"
```

---

### Task 5: 상단바에 등급 표시

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/TopBar.tsx`

**Interfaces:**
- Consumes: `staff.grade` 컬럼(Task 2)
- Produces: `TopBar`의 새 선택 prop `staffGrade: string | null`. 이후 태스크가 참조하지 않는다.

- [ ] **Step 1: `layout.tsx`에서 등급 조회·전달**

`.select('name, role')`를 `.select('name, role, grade')`로 교체하고, `<TopBar staffName={staffName} unreadCount={unreadCount} />`를 아래로 교체:

```tsx
      <TopBar staffName={staffName} staffGrade={staff?.grade ?? null} unreadCount={unreadCount} />
```

(`grade` 컬럼이 아직 없는 DB에서는 조회가 실패해 `staff`가 null이 되지만, `staffName`은 기존처럼 이메일로 대체되므로 화면은 깨지지 않는다.)

- [ ] **Step 2: `TopBar.tsx`에서 등급 표시**

1. `TopBarProps`에 `staffGrade: string | null;` 한 줄을 추가하고, 함수 시그니처를 `export function TopBar({ staffName, staffGrade, unreadCount }: TopBarProps) {`로 바꾼다.
2. `<span className="muted-text">{staffName ?? '로그인됨'}</span>`를 아래로 교체:

```tsx
        <span className="muted-text">
          {staffName ?? '로그인됨'}
          {staffGrade ? ` · ${staffGrade}` : ''}
        </span>
```

- [ ] **Step 3: 타입·빌드 확인**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(app)/layout.tsx" src/components/TopBar.tsx
git commit -m "feat: show staff grade next to the name in the top bar"
```

---

### Task 6: 실제 DB 적용 + 종단 검증

**Files:** 없음(검증 전용. 코드를 고치면 별도 커밋).

**Interfaces:**
- Consumes: Task 1-5 전체
- Produces: 없음.

- [ ] **Step 1: 사전 확인(컨트롤러 전용, 사용자 확인 필수)**

공유 프로덕션 DB를 건드리므로 서브에이전트가 아니라 컨트롤러가 직접, 사용자 확인을 받은 뒤 수행한다. 먼저 Management API로 현재 `staff` 행들을 조회해(`select id, name, role, status from staff`) 원장(`role='owner'`)이 누구인지, 다른 계정이 `role='owner'`로 잘못 들어 있지 않은지 확인한다. 이후 `supabase/migration_staff_grade.sql`을 그대로 실행한다.

- [ ] **Step 2: 마이그레이션 결과 확인**

`select name, role, grade from staff order by role, name`으로 확인한다.
Expected: `role='owner'`인 행은 모두 `대표원장`, 나머지는 `사원`. 다음 두 문장이 **거부되는지**도 확인한다(임시 행이 남지 않게 트랜잭션 또는 즉시 삭제):
- `role='staff'`인 행을 `grade='대표원장'`으로 바꾸려는 update → 제약 위반
- `role='owner'`인 행을 `grade='사원'`으로 바꾸려는 update → 제약 위반

- [ ] **Step 3: API 권한 종단 검증(임시 계정, 실제 인증 세션)**

임시 계정을 만든다(대표원장 1, 승인 완료 일반 직원 1, 승인 대기 직원 1. `role='owner'` 계정은 `grade: '대표원장'`, `status: 'approved'`로 삽입). 각 계정으로 로그인한 세션 토큰으로 `npm run dev` 서버의 API를 직접 호출해 확인한다:
1. 일반 직원 세션으로 `POST /api/staff/grade` → 403
2. 대표원장 세션으로 `POST /api/staff/grade`에 `grade: '대표원장'` → 400
3. 대표원장 세션으로 대표원장 본인 `staffId`를 넣어 호출 → 404(대표원장 행은 바뀌지 않음)
4. 대표원장 세션으로 승인 대기 직원을 `POST /api/staff/approve`에 `grade: '팀장'`으로 호출 → 200, DB에서 `status='approved'`, `grade='팀장'`
5. 대표원장 세션으로 `POST /api/staff/grade`에 `grade: '부원장'`을 승인 완료 직원에게 호출 → 200, DB에서 `부원장`
6. 일반 직원 세션이 Supabase REST로 자기 `staff` 행의 `grade`를 직접 update → 거부(0행 또는 권한 오류) — 컬럼 grant가 막는지 확인

- [ ] **Step 4: 화면 확인(브라우저)**

대표원장 임시 계정으로 로그인해 `/staff-approval`에서 승인 대기 행의 등급 선택(기본 사원)·승인, 사용 중인 계정 목록의 드롭다운으로 등급 변경, 대표원장 행에 드롭다운이 없는지, 상단바에 `이름 · 등급`이 나오는지 확인한다.

- [ ] **Step 5: 정리**

임시 계정과 그 `staff` 행을 삭제하고, 개발 서버를 종료한다. `npm run test`로 전체 통과를 확인한다.

- [ ] **Step 6: 커밋**

검증 중 코드를 고치지 않았다면 커밋할 파일이 없다 — 그 경우 이 단계는 생략하고 SDD 원장에 "Task 6: complete, no code changes"로 기록한다.
