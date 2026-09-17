# 해피콜 (초진환자 해피콜 + 해피콜 목록) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two "준비 중" placeholder pages (`/happy-call-register`, `/happy-call-list`) with working features: 초진환자 해피콜 (spreadsheet-equivalent patient tracking + retention stats) and 해피콜 목록 (unified daily call worklist merging manual 초진 entries with auto-generated 한약/린다이어트 call schedules).

**Architecture:** Four new Supabase tables in the shared `hanyak-ondam` project. A pure, dependency-free calculation module (`src/lib/happyCallStats.ts`) holds all date/stat math and is fully unit-tested — this is the first real business logic in ondam-dashboard. Two thin Supabase data-access modules wrap CRUD for the two page groups. Both pages are Client Components using the existing browser Supabase client pattern (same as `Sidebar.tsx`/`login/page.tsx`), fetching on mount and writing directly through RLS — no new Route Handlers needed.

**Tech Stack:** Next.js (App Router), TypeScript, `@supabase/supabase-js` (already a dependency), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-happy-call-design.md`

## Global Constraints

- No `SUPABASE_SERVICE_ROLE_KEY` in app runtime — all data access goes through the public anon key + RLS scoped to `authenticated`, exactly like the rest of this project.
- No CSS framework — inline styles only.
- All four new tables get `authenticated`-scoped RLS with full select/insert/update (no owner-only restriction) — matches the spec's explicit YAGNI call (§2, §4 of the 2026-09-17 dashboard spec).
- Before applying `supabase/schema.sql` to the live `hanyak-ondam` project, confirm none of the 4 new table names (`happy_call_patients`, `herb_medicine_prescriptions`, `diet_packages`, `diet_package_calls`, `happy_call_manual_entries` — 5 tables) collide with existing tables (`prescriptions`, `daily_records`, `reservations`, `monthly_goals`, `staff`). This is a live shared production database — schema application and any real data seeding is a controller-level action requiring explicit user confirmation (per the 2026-09-17 dashboard spec's §3 amendment), never a plain subagent action.
- All dates are calendar dates (`YYYY-MM-DD` strings, no time component). All date arithmetic must use UTC internally (`Date.UTC(...)`/`getUTCDate()`/`setUTCDate()`, never local-timezone `Date` methods) to avoid off-by-one bugs from the server/browser's local timezone.
- The 3-week maturity window for 초진 이탈률/삼진율 is exactly 21 days (`daysBetween(firstVisitDate, referenceDate) >= 21`).

## Prerequisites

None — this plan builds on the existing ondam-dashboard Phase 1+2 foundation (Supabase Auth, `staff` table, sidebar/layout) already merged to `master`. No new npm packages are required.

---

### Task 1: Database schema + TypeScript types

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing new (staff table/RLS pattern already exists)
- Produces: 5 new tables (see below) and 5 new TypeScript interfaces that every later task imports from `@/lib/types`.

- [ ] **Step 1: Append the new tables to `supabase/schema.sql`**

Append this to the end of the existing file (after the `grant update (name) on staff to authenticated;` line):

```sql

-- Happy call: 초진환자 해피콜
create table if not exists happy_call_patients (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  doctor_staff_id uuid references staff(id),
  patient_type text not null check (patient_type in ('건보', '자보', '비급여')),
  acupuncture_package_success text check (acupuncture_package_success in ('성공', '실패')),
  first_visit_date date not null,
  revisit_1 date,
  revisit_2 date,
  revisit_3 date,
  jabo_herb_1 date,
  jabo_herb_2 date,
  jabo_herb_3 date,
  next_visit_note text,
  call_log text,
  memo text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table happy_call_patients enable row level security;

drop policy if exists "authenticated can read happy_call_patients" on happy_call_patients;
create policy "authenticated can read happy_call_patients" on happy_call_patients
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert happy_call_patients" on happy_call_patients;
create policy "authenticated can insert happy_call_patients" on happy_call_patients
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update happy_call_patients" on happy_call_patients;
create policy "authenticated can update happy_call_patients" on happy_call_patients
  for update using (auth.role() = 'authenticated');

-- Happy call: 한약 처방 (해피콜 목록 자동 생성용)
create table if not exists herb_medicine_prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  pickup_date date not null,
  duration_days smallint not null,
  call_date_1 date not null,
  call_date_2 date not null,
  call_date_3 date not null,
  call_1_done boolean not null default false,
  call_2_done boolean not null default false,
  call_3_done boolean not null default false,
  call_1_note text,
  call_2_note text,
  call_3_note text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table herb_medicine_prescriptions enable row level security;

drop policy if exists "authenticated can read herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can read herb_medicine_prescriptions" on herb_medicine_prescriptions
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can insert herb_medicine_prescriptions" on herb_medicine_prescriptions
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update herb_medicine_prescriptions" on herb_medicine_prescriptions;
create policy "authenticated can update herb_medicine_prescriptions" on herb_medicine_prescriptions
  for update using (auth.role() = 'authenticated');

-- Happy call: 린다이어트 패키지 (해피콜 목록 자동 생성용)
create table if not exists diet_packages (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  detox_start_date date not null,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table diet_packages enable row level security;

drop policy if exists "authenticated can read diet_packages" on diet_packages;
create policy "authenticated can read diet_packages" on diet_packages
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert diet_packages" on diet_packages;
create policy "authenticated can insert diet_packages" on diet_packages
  for insert with check (auth.role() = 'authenticated');

create table if not exists diet_package_calls (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references diet_packages(id) on delete cascade,
  call_date date not null,
  done boolean not null default false,
  note text,
  unique (package_id, call_date)
);

alter table diet_package_calls enable row level security;

drop policy if exists "authenticated can read diet_package_calls" on diet_package_calls;
create policy "authenticated can read diet_package_calls" on diet_package_calls
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert diet_package_calls" on diet_package_calls;
create policy "authenticated can insert diet_package_calls" on diet_package_calls
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update diet_package_calls" on diet_package_calls;
create policy "authenticated can update diet_package_calls" on diet_package_calls
  for update using (auth.role() = 'authenticated');

-- Happy call: 해피콜 목록 — 초진 수동 추가분
create table if not exists happy_call_manual_entries (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  note text,
  call_date date not null,
  done boolean not null default false,
  done_note text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now()
);

alter table happy_call_manual_entries enable row level security;

drop policy if exists "authenticated can read happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can read happy_call_manual_entries" on happy_call_manual_entries
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can insert happy_call_manual_entries" on happy_call_manual_entries
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated can update happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can update happy_call_manual_entries" on happy_call_manual_entries
  for update using (auth.role() = 'authenticated');
```

Do NOT apply this to the live database yet — that happens in Task 8, and only by the controller (see Global Constraints).

- [ ] **Step 2: Append the new types to `src/lib/types.ts`**

```ts
export interface HappyCallPatient {
  id: string;
  patientName: string;
  doctorStaffId: string | null;
  patientType: '건보' | '자보' | '비급여';
  acupunctureSuccess: '성공' | '실패' | null;
  firstVisitDate: string;
  revisit1: string | null;
  revisit2: string | null;
  revisit3: string | null;
  jaboHerb1: string | null;
  jaboHerb2: string | null;
  jaboHerb3: string | null;
  nextVisitNote: string | null;
  callLog: string | null;
  memo: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface HerbMedicinePrescription {
  id: string;
  patientName: string;
  pickupDate: string;
  durationDays: number;
  callDate1: string;
  callDate2: string;
  callDate3: string;
  call1Done: boolean;
  call2Done: boolean;
  call3Done: boolean;
  call1Note: string | null;
  call2Note: string | null;
  call3Note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface DietPackage {
  id: string;
  patientName: string;
  detoxStartDate: string;
  createdBy: string | null;
  createdAt: string;
}

export interface DietPackageCall {
  id: string;
  packageId: string;
  callDate: string;
  done: boolean;
  note: string | null;
}

export interface HappyCallManualEntry {
  id: string;
  patientName: string;
  note: string | null;
  callDate: string;
  done: boolean;
  doneNote: string | null;
  createdBy: string | null;
  createdAt: string;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run build`
Expected: succeeds (these are just type/SQL additions, nothing references them yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql src/lib/types.ts
git commit -m "feat: add happy-call schema and types"
```

---

### Task 2: Calculation logic (pure functions) + unit tests

**Files:**
- Create: `src/lib/happyCallStats.ts`
- Test: `src/lib/happyCallStats.test.ts`

**Interfaces:**
- Consumes: `HappyCallPatient` type (Task 1)
- Produces: `computeHerbCallDates(pickupDate, durationDays)`, `computeDietCallDates(detoxStartDate)`, `computeFirstVisitStats(patients, referenceDate)`, `getWeekRange(dateStr)` — Task 5 (stats panel) and Task 6 (queue data-access) both import from this file by these exact names.

- [ ] **Step 1: Write `src/lib/happyCallStats.ts`**

```ts
import type { HappyCallPatient } from './types';

const MATURITY_DAYS = 21;

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromStr: string, toStr: string): number {
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

export function computeHerbCallDates(
  pickupDate: string,
  durationDays: number
): { callDate1: string; callDate2: string; callDate3: string } {
  const callDate1 = addDays(pickupDate, 1);
  const callDate2 = addDays(pickupDate, Math.floor(durationDays / 2));
  let callDate3 = addDays(pickupDate, durationDays - 3);
  if (callDate3 < callDate1) {
    callDate3 = callDate1;
  }
  return { callDate1, callDate2, callDate3 };
}

export function computeDietCallDates(detoxStartDate: string): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= 7; i++) {
    dates.push(addDays(detoxStartDate, i));
  }
  return dates;
}

export interface FirstVisitStats {
  patientCount: number;
  revisitRate: number;
  dropoutRate: number;
  tripleVisitRate: number;
  matureCount: number;
}

export function computeFirstVisitStats(
  patients: HappyCallPatient[],
  referenceDate: string
): FirstVisitStats {
  const patientCount = patients.length;
  if (patientCount === 0) {
    return { patientCount: 0, revisitRate: 0, dropoutRate: 0, tripleVisitRate: 0, matureCount: 0 };
  }

  const revisitedCount = patients.filter((p) => p.revisit1 !== null).length;
  const revisitRate = revisitedCount / patientCount;

  const mature = patients.filter(
    (p) => daysBetween(p.firstVisitDate, referenceDate) >= MATURITY_DAYS
  );
  const matureCount = mature.length;

  const dropoutCount = mature.filter((p) => p.revisit1 === null).length;
  const tripleCount = mature.filter(
    (p) => p.revisit1 !== null && p.revisit2 !== null && p.revisit3 !== null
  ).length;

  return {
    patientCount,
    revisitRate,
    dropoutRate: matureCount > 0 ? dropoutCount / matureCount : 0,
    tripleVisitRate: matureCount > 0 ? tripleCount / matureCount : 0,
    matureCount,
  };
}

export function getWeekRange(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayOfWeek = date.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}
```

- [ ] **Step 2: Write `src/lib/happyCallStats.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  computeHerbCallDates,
  computeDietCallDates,
  computeFirstVisitStats,
  getWeekRange,
} from './happyCallStats';
import type { HappyCallPatient } from './types';

describe('computeHerbCallDates', () => {
  it('computes call dates for a 15-day prescription', () => {
    expect(computeHerbCallDates('2026-09-01', 15)).toEqual({
      callDate1: '2026-09-02',
      callDate2: '2026-09-08',
      callDate3: '2026-09-13',
    });
  });

  it('computes call dates for a 30-day prescription', () => {
    expect(computeHerbCallDates('2026-09-01', 30)).toEqual({
      callDate1: '2026-09-02',
      callDate2: '2026-09-16',
      callDate3: '2026-09-28',
    });
  });

  it('clamps call_date_3 to call_date_1 when duration is very short', () => {
    const result = computeHerbCallDates('2026-09-01', 2);
    expect(result.callDate3 >= result.callDate1).toBe(true);
    expect(result.callDate3).toBe(result.callDate1);
  });
});

describe('computeDietCallDates', () => {
  it('returns 7 dates starting the day after detox_start_date', () => {
    expect(computeDietCallDates('2026-09-01')).toEqual([
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
    ]);
  });
});

function makePatient(overrides: Partial<HappyCallPatient>): HappyCallPatient {
  return {
    id: 'test-id',
    patientName: '테스트',
    doctorStaffId: null,
    patientType: '건보',
    acupunctureSuccess: null,
    firstVisitDate: '2026-09-01',
    revisit1: null,
    revisit2: null,
    revisit3: null,
    jaboHerb1: null,
    jaboHerb2: null,
    jaboHerb3: null,
    nextVisitNote: null,
    callLog: null,
    memo: null,
    createdBy: null,
    createdAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeFirstVisitStats', () => {
  it('returns all zeros for an empty patient list', () => {
    expect(computeFirstVisitStats([], '2026-09-22')).toEqual({
      patientCount: 0,
      revisitRate: 0,
      dropoutRate: 0,
      tripleVisitRate: 0,
      matureCount: 0,
    });
  });

  it('excludes patients younger than 3 weeks from dropout/triple calculations', () => {
    const patients = [makePatient({ firstVisitDate: '2026-09-20' })];
    const stats = computeFirstVisitStats(patients, '2026-09-22');
    expect(stats.patientCount).toBe(1);
    expect(stats.matureCount).toBe(0);
    expect(stats.dropoutRate).toBe(0);
  });

  it('counts a mature patient with no revisit as a dropout', () => {
    const patients = [makePatient({ firstVisitDate: '2026-09-01' })];
    const stats = computeFirstVisitStats(patients, '2026-09-22');
    expect(stats.matureCount).toBe(1);
    expect(stats.dropoutRate).toBe(1);
    expect(stats.tripleVisitRate).toBe(0);
  });

  it('counts a mature patient with all 3 revisits as a triple-visit', () => {
    const patients = [
      makePatient({
        firstVisitDate: '2026-09-01',
        revisit1: '2026-09-05',
        revisit2: '2026-09-10',
        revisit3: '2026-09-15',
      }),
    ];
    const stats = computeFirstVisitStats(patients, '2026-09-22');
    expect(stats.matureCount).toBe(1);
    expect(stats.dropoutRate).toBe(0);
    expect(stats.tripleVisitRate).toBe(1);
    expect(stats.revisitRate).toBe(1);
  });

  it('counts revisit rate for patients with at least one revisit, regardless of maturity', () => {
    const patients = [makePatient({ firstVisitDate: '2026-09-20', revisit1: '2026-09-21' })];
    const stats = computeFirstVisitStats(patients, '2026-09-22');
    expect(stats.revisitRate).toBe(1);
    expect(stats.matureCount).toBe(0);
  });
});

describe('getWeekRange', () => {
  it('returns a 7-day range containing the input date', () => {
    const { start, end } = getWeekRange('2026-09-18');
    expect(start <= '2026-09-18').toBe(true);
    expect(end >= '2026-09-18').toBe(true);
    const diffDays = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
    expect(diffDays).toBe(6);
  });

  it('starts on a Monday and ends on a Sunday', () => {
    const { start, end } = getWeekRange('2026-09-18');
    expect(new Date(start).getUTCDay()).toBe(1);
    expect(new Date(end).getUTCDay()).toBe(0);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm run test`
Expected: all `happyCallStats.test.ts` tests PASS (this is the project's first real test file — `--passWithNoTests` no longer applies since a test file now exists).

- [ ] **Step 4: Commit**

```bash
git add src/lib/happyCallStats.ts src/lib/happyCallStats.test.ts
git commit -m "feat: add happy-call calculation logic with unit tests"
```

---

### Task 3: Supabase data-access layer for 초진환자 (`happy_call_patients`)

**Files:**
- Create: `src/lib/supabase/happyCallPatients.ts`

**Interfaces:**
- Consumes: `HappyCallPatient` type (Task 1)
- Produces: `listHappyCallPatients(supabase)`, `createHappyCallPatient(supabase, input)`, `updateHappyCallPatient(supabase, id, patch)` — Task 4 imports these by exact name.

- [ ] **Step 1: Write `src/lib/supabase/happyCallPatients.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HappyCallPatient } from '@/lib/types';

interface HappyCallPatientRow {
  id: string;
  patient_name: string;
  doctor_staff_id: string | null;
  patient_type: '건보' | '자보' | '비급여';
  acupuncture_package_success: '성공' | '실패' | null;
  first_visit_date: string;
  revisit_1: string | null;
  revisit_2: string | null;
  revisit_3: string | null;
  jabo_herb_1: string | null;
  jabo_herb_2: string | null;
  jabo_herb_3: string | null;
  next_visit_note: string | null;
  call_log: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

function rowToPatient(row: HappyCallPatientRow): HappyCallPatient {
  return {
    id: row.id,
    patientName: row.patient_name,
    doctorStaffId: row.doctor_staff_id,
    patientType: row.patient_type,
    acupunctureSuccess: row.acupuncture_package_success,
    firstVisitDate: row.first_visit_date,
    revisit1: row.revisit_1,
    revisit2: row.revisit_2,
    revisit3: row.revisit_3,
    jaboHerb1: row.jabo_herb_1,
    jaboHerb2: row.jabo_herb_2,
    jaboHerb3: row.jabo_herb_3,
    nextVisitNote: row.next_visit_note,
    callLog: row.call_log,
    memo: row.memo,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listHappyCallPatients(supabase: SupabaseClient): Promise<HappyCallPatient[]> {
  const { data, error } = await supabase
    .from('happy_call_patients')
    .select('*')
    .order('first_visit_date', { ascending: false });
  if (error) throw error;
  return (data as HappyCallPatientRow[]).map(rowToPatient);
}

export interface NewHappyCallPatient {
  patientName: string;
  doctorStaffId: string | null;
  patientType: '건보' | '자보' | '비급여';
  firstVisitDate: string;
  createdBy: string | null;
}

export async function createHappyCallPatient(
  supabase: SupabaseClient,
  input: NewHappyCallPatient
): Promise<HappyCallPatient> {
  const { data, error } = await supabase
    .from('happy_call_patients')
    .insert({
      patient_name: input.patientName,
      doctor_staff_id: input.doctorStaffId,
      patient_type: input.patientType,
      first_visit_date: input.firstVisitDate,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToPatient(data as HappyCallPatientRow);
}

export type HappyCallPatientPatch = Partial<{
  revisit1: string | null;
  revisit2: string | null;
  revisit3: string | null;
  jaboHerb1: string | null;
  jaboHerb2: string | null;
  jaboHerb3: string | null;
  acupunctureSuccess: '성공' | '실패' | null;
  nextVisitNote: string | null;
  callLog: string | null;
  memo: string | null;
}>;

export async function updateHappyCallPatient(
  supabase: SupabaseClient,
  id: string,
  patch: HappyCallPatientPatch
): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if ('revisit1' in patch) dbPatch.revisit_1 = patch.revisit1;
  if ('revisit2' in patch) dbPatch.revisit_2 = patch.revisit2;
  if ('revisit3' in patch) dbPatch.revisit_3 = patch.revisit3;
  if ('jaboHerb1' in patch) dbPatch.jabo_herb_1 = patch.jaboHerb1;
  if ('jaboHerb2' in patch) dbPatch.jabo_herb_2 = patch.jaboHerb2;
  if ('jaboHerb3' in patch) dbPatch.jabo_herb_3 = patch.jaboHerb3;
  if ('acupunctureSuccess' in patch) dbPatch.acupuncture_package_success = patch.acupunctureSuccess;
  if ('nextVisitNote' in patch) dbPatch.next_visit_note = patch.nextVisitNote;
  if ('callLog' in patch) dbPatch.call_log = patch.callLog;
  if ('memo' in patch) dbPatch.memo = patch.memo;

  const { error } = await supabase.from('happy_call_patients').update(dbPatch).eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/happyCallPatients.ts
git commit -m "feat: add happy_call_patients data-access layer"
```

---

### Task 4: `/happy-call-register` page — entry form + editable list

**Files:**
- Modify: `src/app/(app)/happy-call-register/page.tsx` (replaces the Task-6 Phase-1+2 placeholder)

**Interfaces:**
- Consumes: `listHappyCallPatients`/`createHappyCallPatient`/`updateHappyCallPatient` (Task 3), `HappyCallPatient`/`Staff` types (Task 1 / Phase 1+2), `createClient` (Phase 1+2's `src/lib/supabase/client.ts`)
- Produces: nothing new later tasks depend on directly — Task 5 modifies this same file to add the stats panel.

- [ ] **Step 1: Replace `src/app/(app)/happy-call-register/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listHappyCallPatients,
  createHappyCallPatient,
  updateHappyCallPatient,
} from '@/lib/supabase/happyCallPatients';
import type { HappyCallPatient, Staff } from '@/lib/types';

const PATIENT_TYPES: HappyCallPatient['patientType'][] = ['건보', '자보', '비급여'];

const cellStyle = { border: '1px solid #ddd', padding: 6 };

export default function HappyCallRegisterPage() {
  const [patients, setPatients] = useState<HappyCallPatient[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [newDoctorId, setNewDoctorId] = useState('');
  const [newPatientType, setNewPatientType] = useState<HappyCallPatient['patientType']>('건보');
  const [newFirstVisitDate, setNewFirstVisitDate] = useState('');

  const supabase = createClient();

  async function load() {
    setLoading(true);
    try {
      const [patientRows, staffResult] = await Promise.all([
        listHappyCallPatients(supabase),
        supabase.from('staff').select('id, name, role'),
      ]);
      setPatients(patientRows);
      setStaffList((staffResult.data ?? []) as Staff[]);
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!newName || !newFirstVisitDate) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await createHappyCallPatient(supabase, {
      patientName: newName,
      doctorStaffId: newDoctorId || null,
      patientType: newPatientType,
      firstVisitDate: newFirstVisitDate,
      createdBy: user?.id ?? null,
    });
    setNewName('');
    setNewDoctorId('');
    setNewFirstVisitDate('');
    await load();
  }

  type TextField = 'revisit1' | 'revisit2' | 'revisit3' | 'jaboHerb1' | 'jaboHerb2' | 'jaboHerb3' | 'nextVisitNote' | 'callLog' | 'memo';

  async function handleFieldUpdate(id: string, field: TextField, value: string) {
    await updateHappyCallPatient(supabase, id, { [field]: value || null });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value || null } : p)));
  }

  async function handleSuccessUpdate(id: string, value: '성공' | '실패' | '') {
    const acupunctureSuccess = value === '' ? null : value;
    await updateHappyCallPatient(supabase, id, { acupunctureSuccess });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, acupunctureSuccess } : p)));
  }

  function staffName(staffId: string | null): string {
    if (!staffId) return '-';
    return staffList.find((s) => s.id === staffId)?.name ?? '-';
  }

  if (loading) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>초진환자 해피콜</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <input placeholder="성함" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: 6 }} />
        <select value={newDoctorId} onChange={(e) => setNewDoctorId(e.target.value)} style={{ padding: 6 }}>
          <option value="">진료의 선택</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={newPatientType}
          onChange={(e) => setNewPatientType(e.target.value as HappyCallPatient['patientType'])}
          style={{ padding: 6 }}
        >
          {PATIENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input type="date" value={newFirstVisitDate} onChange={(e) => setNewFirstVisitDate(e.target.value)} style={{ padding: 6 }} />
        <button type="submit" style={{ padding: '6px 16px' }}>
          추가
        </button>
      </form>

      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            {['성함', '진료의', '구분', '초진일', '재내원1', '재내원2', '재내원3', '자보약1', '자보약2', '자보약3', '약침성공', '다음내원메모', '통화내역', '메모'].map((h) => (
              <th key={h} style={{ ...cellStyle, textAlign: 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id}>
              <td style={cellStyle}>{p.patientName}</td>
              <td style={cellStyle}>{staffName(p.doctorStaffId)}</td>
              <td style={cellStyle}>{p.patientType}</td>
              <td style={cellStyle}>{p.firstVisitDate}</td>
              {(['revisit1', 'revisit2', 'revisit3'] as const).map((field) => (
                <td key={field} style={cellStyle}>
                  <input type="date" defaultValue={p[field] ?? ''} onBlur={(e) => handleFieldUpdate(p.id, field, e.target.value)} style={{ width: 130 }} />
                </td>
              ))}
              {(['jaboHerb1', 'jaboHerb2', 'jaboHerb3'] as const).map((field) => (
                <td key={field} style={cellStyle}>
                  <input type="date" defaultValue={p[field] ?? ''} onBlur={(e) => handleFieldUpdate(p.id, field, e.target.value)} style={{ width: 130 }} />
                </td>
              ))}
              <td style={cellStyle}>
                <select defaultValue={p.acupunctureSuccess ?? ''} onChange={(e) => handleSuccessUpdate(p.id, e.target.value as '성공' | '실패' | '')}>
                  <option value=""></option>
                  <option value="성공">성공</option>
                  <option value="실패">실패</option>
                </select>
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.nextVisitNote ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'nextVisitNote', e.target.value)} style={{ width: 160 }} />
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.callLog ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'callLog', e.target.value)} style={{ width: 160 }} />
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.memo ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'memo', e.target.value)} style={{ width: 120 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/happy-call-register/page.tsx"
git commit -m "feat: add happy-call-register entry form and editable patient list"
```

---

### Task 5: `/happy-call-register` stats dashboard

**Files:**
- Create: `src/components/happy-call/HappyCallStatsPanel.tsx`
- Modify: `src/app/(app)/happy-call-register/page.tsx` (Task 4's file — add the panel below the table)

**Interfaces:**
- Consumes: `computeFirstVisitStats`/`getWeekRange` (Task 2), `HappyCallPatient`/`Staff` types
- Produces: `HappyCallStatsPanel` component, `{ patients: HappyCallPatient[], staffList: Staff[] }` props. Nothing later depends on this beyond the page itself.

- [ ] **Step 1: Write `src/components/happy-call/HappyCallStatsPanel.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { computeFirstVisitStats, getWeekRange } from '@/lib/happyCallStats';
import type { HappyCallPatient, Staff } from '@/lib/types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

const cellStyle = { border: '1px solid #ddd', padding: 6 };

export function HappyCallStatsPanel({ patients, staffList }: { patients: HappyCallPatient[]; staffList: Staff[] }) {
  const [referenceDate, setReferenceDate] = useState(todayISO());
  const [doctorId, setDoctorId] = useState('');
  const today = todayISO();

  const { start, end } = useMemo(() => getWeekRange(referenceDate), [referenceDate]);

  const weekPatients = useMemo(
    () => patients.filter((p) => p.firstVisitDate >= start && p.firstVisitDate <= end),
    [patients, start, end]
  );

  const clinicStats = useMemo(() => computeFirstVisitStats(weekPatients, today), [weekPatients, today]);

  const doctorPatients = useMemo(
    () => (doctorId ? weekPatients.filter((p) => p.doctorStaffId === doctorId) : weekPatients),
    [weekPatients, doctorId]
  );
  const doctorStats = useMemo(() => computeFirstVisitStats(doctorPatients, today), [doctorPatients, today]);

  const byPatientType = useMemo(() => {
    const types: HappyCallPatient['patientType'][] = ['건보', '자보', '비급여'];
    return types.map((type) => ({
      type,
      stats: computeFirstVisitStats(
        weekPatients.filter((p) => p.patientType === type),
        today
      ),
    }));
  }, [weekPatients, today]);

  return (
    <div style={{ marginTop: 32, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>주별 통계</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} />
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">전체 진료의</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: '#666' }}>
          {start} ~ {end}
        </span>
      </div>

      <table style={{ borderCollapse: 'collapse', marginBottom: 16 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={cellStyle}></th>
            <th style={cellStyle}>선택 진료의</th>
            <th style={cellStyle}>한의원 전체</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cellStyle}>초진환자수</td>
            <td style={cellStyle}>{doctorStats.patientCount}</td>
            <td style={cellStyle}>{clinicStats.patientCount}</td>
          </tr>
          <tr>
            <td style={cellStyle}>재진율</td>
            <td style={cellStyle}>{formatPercent(doctorStats.revisitRate)}</td>
            <td style={cellStyle}>{formatPercent(clinicStats.revisitRate)}</td>
          </tr>
          <tr>
            <td style={cellStyle}>이탈률</td>
            <td style={cellStyle}>{formatPercent(doctorStats.dropoutRate)}</td>
            <td style={cellStyle}>{formatPercent(clinicStats.dropoutRate)}</td>
          </tr>
          <tr>
            <td style={cellStyle}>삼진율</td>
            <td style={cellStyle}>{formatPercent(doctorStats.tripleVisitRate)}</td>
            <td style={cellStyle}>{formatPercent(clinicStats.tripleVisitRate)}</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ fontSize: 14, marginBottom: 8 }}>환자구분별</h3>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={cellStyle}>구분</th>
            <th style={cellStyle}>초진환자수</th>
            <th style={cellStyle}>재진율</th>
            <th style={cellStyle}>이탈률</th>
            <th style={cellStyle}>삼진율</th>
          </tr>
        </thead>
        <tbody>
          {byPatientType.map(({ type, stats }) => (
            <tr key={type}>
              <td style={cellStyle}>{type}</td>
              <td style={cellStyle}>{stats.patientCount}</td>
              <td style={cellStyle}>{formatPercent(stats.revisitRate)}</td>
              <td style={cellStyle}>{formatPercent(stats.dropoutRate)}</td>
              <td style={cellStyle}>{formatPercent(stats.tripleVisitRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `src/app/(app)/happy-call-register/page.tsx`:

1. Add the import: `import { HappyCallStatsPanel } from '@/components/happy-call/HappyCallStatsPanel';`
2. Immediately after the closing `</table>` of the patient list (and before the final closing `</div>` of the component), add:

```tsx
      <HappyCallStatsPanel patients={patients} staffList={staffList} />
```

- [ ] **Step 3: Verify types compile**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/happy-call/HappyCallStatsPanel.tsx "src/app/(app)/happy-call-register/page.tsx"
git commit -m "feat: add weekly stats dashboard to happy-call-register"
```

---

### Task 6: Supabase data-access layer for 한약/린다이어트/수동초진

**Files:**
- Create: `src/lib/supabase/happyCallQueue.ts`

**Interfaces:**
- Consumes: `computeHerbCallDates`/`computeDietCallDates` (Task 2), `HerbMedicinePrescription`/`DietPackage`/`DietPackageCall`/`HappyCallManualEntry` types (Task 1)
- Produces: `createHerbPrescription`, `listPendingHerbCalls`, `markHerbCallDone`, `createDietPackage`, `addDietPackageCall`, `listDietPackages`, `listPendingDietCalls`, `markDietCallDone`, `createManualEntry`, `listPendingManualEntries`, `markManualEntryDone`, and the `PendingDietCall` type — Task 7 imports all of these by exact name (including `addDietPackageCall`/`listDietPackages`, used for the "8일째 이후 수동 추가" UI required by spec §5).

- [ ] **Step 1: Write `src/lib/supabase/happyCallQueue.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeHerbCallDates, computeDietCallDates } from '@/lib/happyCallStats';
import type { HerbMedicinePrescription, DietPackage, DietPackageCall, HappyCallManualEntry } from '@/lib/types';

// --- 한약 처방 ---

interface HerbPrescriptionRow {
  id: string;
  patient_name: string;
  pickup_date: string;
  duration_days: number;
  call_date_1: string;
  call_date_2: string;
  call_date_3: string;
  call_1_done: boolean;
  call_2_done: boolean;
  call_3_done: boolean;
  call_1_note: string | null;
  call_2_note: string | null;
  call_3_note: string | null;
  created_by: string | null;
  created_at: string;
}

function rowToHerbPrescription(row: HerbPrescriptionRow): HerbMedicinePrescription {
  return {
    id: row.id,
    patientName: row.patient_name,
    pickupDate: row.pickup_date,
    durationDays: row.duration_days,
    callDate1: row.call_date_1,
    callDate2: row.call_date_2,
    callDate3: row.call_date_3,
    call1Done: row.call_1_done,
    call2Done: row.call_2_done,
    call3Done: row.call_3_done,
    call1Note: row.call_1_note,
    call2Note: row.call_2_note,
    call3Note: row.call_3_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function createHerbPrescription(
  supabase: SupabaseClient,
  input: { patientName: string; pickupDate: string; durationDays: number; createdBy: string | null }
): Promise<void> {
  const { callDate1, callDate2, callDate3 } = computeHerbCallDates(input.pickupDate, input.durationDays);
  const { error } = await supabase.from('herb_medicine_prescriptions').insert({
    patient_name: input.patientName,
    pickup_date: input.pickupDate,
    duration_days: input.durationDays,
    call_date_1: callDate1,
    call_date_2: callDate2,
    call_date_3: callDate3,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function listPendingHerbCalls(supabase: SupabaseClient, today: string): Promise<HerbMedicinePrescription[]> {
  const { data, error } = await supabase
    .from('herb_medicine_prescriptions')
    .select('*')
    .or(
      `and(call_date_1.lte.${today},call_1_done.eq.false),and(call_date_2.lte.${today},call_2_done.eq.false),and(call_date_3.lte.${today},call_3_done.eq.false)`
    );
  if (error) throw error;
  return (data as HerbPrescriptionRow[]).map(rowToHerbPrescription);
}

export async function markHerbCallDone(supabase: SupabaseClient, id: string, callNumber: 1 | 2 | 3, note: string): Promise<void> {
  const patch: Record<string, unknown> = {
    [`call_${callNumber}_done`]: true,
    [`call_${callNumber}_note`]: note || null,
  };
  const { error } = await supabase.from('herb_medicine_prescriptions').update(patch).eq('id', id);
  if (error) throw error;
}

// --- 린다이어트 패키지 ---

export async function createDietPackage(
  supabase: SupabaseClient,
  input: { patientName: string; detoxStartDate: string; createdBy: string | null }
): Promise<void> {
  const { data, error } = await supabase
    .from('diet_packages')
    .insert({ patient_name: input.patientName, detox_start_date: input.detoxStartDate, created_by: input.createdBy })
    .select()
    .single();
  if (error) throw error;

  const callDates = computeDietCallDates(input.detoxStartDate);
  const { error: callsError } = await supabase
    .from('diet_package_calls')
    .insert(callDates.map((callDate) => ({ package_id: data.id, call_date: callDate })));
  if (callsError) throw callsError;
}

export async function addDietPackageCall(supabase: SupabaseClient, packageId: string, callDate: string): Promise<void> {
  const { error } = await supabase.from('diet_package_calls').insert({ package_id: packageId, call_date: callDate });
  if (error) throw error;
}

export async function listDietPackages(supabase: SupabaseClient): Promise<DietPackage[]> {
  const { data, error } = await supabase
    .from('diet_packages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    patientName: row.patient_name,
    detoxStartDate: row.detox_start_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export interface PendingDietCall extends DietPackageCall {
  patientName: string;
}

interface DietPackageCallRow {
  id: string;
  package_id: string;
  call_date: string;
  done: boolean;
  note: string | null;
  diet_packages: { patient_name: string } | null;
}

export async function listPendingDietCalls(supabase: SupabaseClient, today: string): Promise<PendingDietCall[]> {
  const { data, error } = await supabase
    .from('diet_package_calls')
    .select('id, package_id, call_date, done, note, diet_packages(patient_name)')
    .lte('call_date', today)
    .eq('done', false);
  if (error) throw error;
  return (data as unknown as DietPackageCallRow[]).map((row) => ({
    id: row.id,
    packageId: row.package_id,
    callDate: row.call_date,
    done: row.done,
    note: row.note,
    patientName: row.diet_packages?.patient_name ?? '-',
  }));
}

export async function markDietCallDone(supabase: SupabaseClient, id: string, note: string): Promise<void> {
  const { error } = await supabase.from('diet_package_calls').update({ done: true, note: note || null }).eq('id', id);
  if (error) throw error;
}

// --- 초진 수동 추가 ---

export async function createManualEntry(
  supabase: SupabaseClient,
  input: { patientName: string; note: string; callDate: string; createdBy: string | null }
): Promise<void> {
  const { error } = await supabase.from('happy_call_manual_entries').insert({
    patient_name: input.patientName,
    note: input.note || null,
    call_date: input.callDate,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function listPendingManualEntries(supabase: SupabaseClient, today: string): Promise<HappyCallManualEntry[]> {
  const { data, error } = await supabase.from('happy_call_manual_entries').select('*').lte('call_date', today).eq('done', false);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    patientName: row.patient_name,
    note: row.note,
    callDate: row.call_date,
    done: row.done,
    doneNote: row.done_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export async function markManualEntryDone(supabase: SupabaseClient, id: string, doneNote: string): Promise<void> {
  const { error } = await supabase.from('happy_call_manual_entries').update({ done: true, done_note: doneNote || null }).eq('id', id);
  if (error) throw error;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/happyCallQueue.ts
git commit -m "feat: add data-access layer for herb/diet/manual happy-call queues"
```

---

### Task 7: `/happy-call-list` page — unified worklist

**Files:**
- Modify: `src/app/(app)/happy-call-list/page.tsx` (replaces the Task-6 Phase-1+2 placeholder)

**Interfaces:**
- Consumes: everything exported from Task 6's `src/lib/supabase/happyCallQueue.ts`, `HerbMedicinePrescription`/`HappyCallManualEntry` types
- Produces: nothing later depends on this beyond the page itself.

- [ ] **Step 1: Replace `src/app/(app)/happy-call-list/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  createHerbPrescription,
  listPendingHerbCalls,
  markHerbCallDone,
  createDietPackage,
  addDietPackageCall,
  listDietPackages,
  listPendingDietCalls,
  markDietCallDone,
  createManualEntry,
  listPendingManualEntries,
  markManualEntryDone,
  type PendingDietCall,
} from '@/lib/supabase/happyCallQueue';
import type { HerbMedicinePrescription, HappyCallManualEntry, DietPackage } from '@/lib/types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type WorklistRow =
  | { kind: 'herb'; id: string; patientName: string; callDate: string; callNumber: 1 | 2 | 3; prescriptionId: string }
  | { kind: 'diet'; id: string; patientName: string; callDate: string }
  | { kind: 'manual'; id: string; patientName: string; callDate: string; note: string | null };

const cellStyle = { border: '1px solid #ddd', padding: 6 };
const formBoxStyle = { border: '1px solid #ddd', borderRadius: 8, padding: 12 };
const formInputStyle = { display: 'block' as const, marginBottom: 6, padding: 6 };

export default function HappyCallListPage() {
  const [herbPrescriptions, setHerbPrescriptions] = useState<HerbMedicinePrescription[]>([]);
  const [dietCalls, setDietCalls] = useState<PendingDietCall[]>([]);
  const [dietPackages, setDietPackages] = useState<DietPackage[]>([]);
  const [manualEntries, setManualEntries] = useState<HappyCallManualEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [herbName, setHerbName] = useState('');
  const [herbPickupDate, setHerbPickupDate] = useState('');
  const [herbDuration, setHerbDuration] = useState('');

  const [dietName, setDietName] = useState('');
  const [dietStartDate, setDietStartDate] = useState('');

  const [extraCallPackageId, setExtraCallPackageId] = useState('');
  const [extraCallDate, setExtraCallDate] = useState('');

  const [manualName, setManualName] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualCallDate, setManualCallDate] = useState(todayISO());

  const supabase = createClient();
  const today = todayISO();

  async function load() {
    setLoading(true);
    const [herb, diet, packages, manual] = await Promise.all([
      listPendingHerbCalls(supabase, today),
      listPendingDietCalls(supabase, today),
      listDietPackages(supabase),
      listPendingManualEntries(supabase, today),
    ]);
    setHerbPrescriptions(herb);
    setDietCalls(diet);
    setDietPackages(packages);
    setManualEntries(manual);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function currentUserId(): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  }

  async function handleAddHerb(event: React.FormEvent) {
    event.preventDefault();
    if (!herbName || !herbPickupDate || !herbDuration) return;
    await createHerbPrescription(supabase, {
      patientName: herbName,
      pickupDate: herbPickupDate,
      durationDays: Number(herbDuration),
      createdBy: await currentUserId(),
    });
    setHerbName('');
    setHerbPickupDate('');
    setHerbDuration('');
    await load();
  }

  async function handleAddDiet(event: React.FormEvent) {
    event.preventDefault();
    if (!dietName || !dietStartDate) return;
    await createDietPackage(supabase, {
      patientName: dietName,
      detoxStartDate: dietStartDate,
      createdBy: await currentUserId(),
    });
    setDietName('');
    setDietStartDate('');
    await load();
  }

  async function handleAddExtraDietCall(event: React.FormEvent) {
    event.preventDefault();
    if (!extraCallPackageId || !extraCallDate) return;
    await addDietPackageCall(supabase, extraCallPackageId, extraCallDate);
    setExtraCallPackageId('');
    setExtraCallDate('');
    await load();
  }

  async function handleAddManual(event: React.FormEvent) {
    event.preventDefault();
    if (!manualName || !manualCallDate) return;
    await createManualEntry(supabase, {
      patientName: manualName,
      note: manualNote,
      callDate: manualCallDate,
      createdBy: await currentUserId(),
    });
    setManualName('');
    setManualNote('');
    setManualCallDate(todayISO());
    await load();
  }

  const rows: WorklistRow[] = [
    ...herbPrescriptions.flatMap((p) => {
      const items: WorklistRow[] = [];
      if (!p.call1Done && p.callDate1 <= today)
        items.push({ kind: 'herb', id: `${p.id}-1`, patientName: p.patientName, callDate: p.callDate1, callNumber: 1, prescriptionId: p.id });
      if (!p.call2Done && p.callDate2 <= today)
        items.push({ kind: 'herb', id: `${p.id}-2`, patientName: p.patientName, callDate: p.callDate2, callNumber: 2, prescriptionId: p.id });
      if (!p.call3Done && p.callDate3 <= today)
        items.push({ kind: 'herb', id: `${p.id}-3`, patientName: p.patientName, callDate: p.callDate3, callNumber: 3, prescriptionId: p.id });
      return items;
    }),
    ...dietCalls.map((c) => ({ kind: 'diet' as const, id: c.id, patientName: c.patientName, callDate: c.callDate })),
    ...manualEntries.map((m) => ({ kind: 'manual' as const, id: m.id, patientName: m.patientName, callDate: m.callDate, note: m.note })),
  ].sort((a, b) => a.callDate.localeCompare(b.callDate));

  async function handleComplete(row: WorklistRow) {
    const note = window.prompt('통화 메모 (선택)') ?? '';
    if (row.kind === 'herb') {
      await markHerbCallDone(supabase, row.prescriptionId, row.callNumber, note);
    } else if (row.kind === 'diet') {
      await markDietCallDone(supabase, row.id, note);
    } else {
      await markManualEntryDone(supabase, row.id, note);
    }
    await load();
  }

  const kindLabel: Record<WorklistRow['kind'], string> = { herb: '한약', diet: '린다이어트', manual: '초진' };

  if (loading) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>해피콜 목록</h1>

      <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 32 }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={{ ...cellStyle, textAlign: 'left' }}>유형</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>환자명</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>예정일</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>메모</th>
            <th style={cellStyle}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#666' }}>
                오늘 해피콜 대상이 없습니다.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{kindLabel[row.kind]}</td>
              <td style={cellStyle}>{row.patientName}</td>
              <td style={{ ...cellStyle, color: row.callDate < today ? 'red' : undefined }}>{row.callDate}</td>
              <td style={cellStyle}>{row.kind === 'manual' ? row.note : ''}</td>
              <td style={cellStyle}>
                <button onClick={() => handleComplete(row)}>완료</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <form onSubmit={handleAddHerb} style={formBoxStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>한약 처방 등록</h3>
          <input placeholder="환자명" value={herbName} onChange={(e) => setHerbName(e.target.value)} style={formInputStyle} />
          <label style={{ fontSize: 12 }}>수령일</label>
          <input type="date" value={herbPickupDate} onChange={(e) => setHerbPickupDate(e.target.value)} style={formInputStyle} />
          <label style={{ fontSize: 12 }}>기간(일수)</label>
          <input type="number" value={herbDuration} onChange={(e) => setHerbDuration(e.target.value)} style={formInputStyle} />
          <button type="submit">등록</button>
        </form>

        <form onSubmit={handleAddDiet} style={formBoxStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>린다이어트 패키지 등록</h3>
          <input placeholder="환자명" value={dietName} onChange={(e) => setDietName(e.target.value)} style={formInputStyle} />
          <label style={{ fontSize: 12 }}>디톡스 시작일</label>
          <input type="date" value={dietStartDate} onChange={(e) => setDietStartDate(e.target.value)} style={formInputStyle} />
          <button type="submit">등록</button>
        </form>

        <form onSubmit={handleAddExtraDietCall} style={formBoxStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>린다이어트 콜 추가 (8일째 이후)</h3>
          <select value={extraCallPackageId} onChange={(e) => setExtraCallPackageId(e.target.value)} style={formInputStyle}>
            <option value="">환자 선택</option>
            {dietPackages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.patientName} ({pkg.detoxStartDate} 시작)
              </option>
            ))}
          </select>
          <label style={{ fontSize: 12 }}>콜 날짜</label>
          <input type="date" value={extraCallDate} onChange={(e) => setExtraCallDate(e.target.value)} style={formInputStyle} />
          <button type="submit">추가</button>
        </form>

        <form onSubmit={handleAddManual} style={formBoxStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>초진 해피콜 추가</h3>
          <input placeholder="환자명" value={manualName} onChange={(e) => setManualName(e.target.value)} style={formInputStyle} />
          <input placeholder="메모" value={manualNote} onChange={(e) => setManualNote(e.target.value)} style={formInputStyle} />
          <label style={{ fontSize: 12 }}>통화 예정일</label>
          <input type="date" value={manualCallDate} onChange={(e) => setManualCallDate(e.target.value)} style={formInputStyle} />
          <button type="submit">추가</button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/happy-call-list/page.tsx"
git commit -m "feat: add happy-call-list unified worklist page"
```

---

### Task 8: Apply schema to the live database + end-to-end verification + docs

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-7
- Produces: nothing later depends on this.

- [ ] **Step 1: Confirm no table-name collision, then apply the schema (controller action, not a plain implementer step)**

Per the Global Constraints, this step touches the shared production `hanyak-ondam` database and must be done by the controller directly (Supabase Management API, using the same pattern as the Phase 1+2 branch's Task 7), with explicit user confirmation before running anything. Query `information_schema.tables` first to confirm none of the 5 new table names collide with existing tables, then execute the appended portion of `supabase/schema.sql`.

- [ ] **Step 2: Manual end-to-end check (controller-run, real browser against the live DB)**

With `npm run dev` running and logged in as a seeded account:

1. `/happy-call-register`: add a new 초진 patient, confirm it appears in the list; fill in `재내원1`, confirm the 주별 통계 panel's 재진율 changes to reflect it.
2. `/happy-call-list`: register a 한약 처방 with a `pickup_date` far enough in the past that `call_date_1` is today or earlier (e.g. `pickup_date` = yesterday), confirm the row appears in the worklist; click 완료, confirm it disappears after reload.
3. `/happy-call-list`: register a 린다이어트 package with `detox_start_date` = yesterday, confirm a row for today appears; complete it, confirm it disappears.
4. `/happy-call-list`: using the 린다이어트 package registered in step 3, add an extra call via "린다이어트 콜 추가 (8일째 이후)" with today's date, confirm it appears in the worklist as an additional row.
5. `/happy-call-list`: add a manual 초진 entry with today's date, confirm it appears; complete it, confirm it disappears.
6. Delete all test data created during this check (both from the app UI where possible and directly via the Management API for anything that can't be deleted through the UI), the same cleanup discipline used for the Phase 1+2 branch's test accounts.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all tests pass (the Task 2 suite plus a clean exit — no more "no test files" state now that real tests exist).

- [ ] **Step 4: Update `README.md`**

In the "범위 (Phase 1 & 2)" section, remove `초진환자 해피콜` and `해피콜 목록` from the "아직 준비 중" list of placeholder pages, and add a line noting they're now implemented. Keep the remaining 5 placeholder pages (치료실 타이머, 비급여 환자 목록, 이벤트 환자 목록, 비대면진료 알람, 물품신청) as-is.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: mark happy-call pages as implemented"
```
