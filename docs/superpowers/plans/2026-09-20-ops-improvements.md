# Ops Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps are described as requirements + acceptance criteria (the implementer reads the code); exact values are given verbatim where they matter.

**Goal:** Fix the security gaps, broken flows and operational weaknesses found in the 2026-09-20 clinic-operations review of ondam-dashboard, using the owner's decisions below.

**Architecture:** Existing Next.js 16 App Router + Supabase (shared project `hanyak-ondam`). Small focused changes per area; pure logic goes in `src/lib/*` with Vitest tests; DB changes go in idempotent `supabase/migration_*.sql` files and are mirrored into `supabase/schema.sql`. **The controller (not the implementer) applies migrations to the live DB.**

**Spec:** the owner's answers (below) + the review findings in the session; there is no separate design doc. Treat "Owner decisions" as the binding authority.

## Owner decisions (binding)

- Staff sign up themselves on the `/signup` page; the owner approves (existing flow). Departed staff must be deletable by the owner.
- Revenue and goals are visible to ALL staff including 부원장 (no gating).
- 재초진 = a patient who visits again 3 months (calendar months) or more after their LAST visit date.
- 초진 happy call: exactly 1 call. If 부재중 (no answer), try ONE more time (the next day); after a second 부재중 the call is closed as "연락 안 됨". If staff are too busy to call, they can push it to the next day ("내일로 미루기"). No weekend/holiday adjustment (clinic is open every day).
- 삼진 = 3 visits within 3 weeks (21 days) after the first visit.
- Revenue basis is 총진료비. The clinic is open Sat/Sun/holidays, so calendar-day pace is CORRECT (do not change it).
- 2026-09-17 daily closing missing is because data entry had not started; just keep an alert for a missing *yesterday* closing.
- Treatment timer page: delete it (OK Chart is used instead). Event-patients page: delete it (on hold, overlaps 비급여). 비대면진료 알람: keep the "준비 중" card; the owner plans web forms later (공진단, 한약 문진표, 보폐고엔오) — no work now.
- Consult transcripts: sent to the external AI without patient consent (owner's decision, do not add consent UI); RETAIN 10 years (never auto-delete; no delete-cascade from staff deletion).
- Herb stock is managed in this app; unit is ONLY 봉지 (bags); it drives ordering of short herbs.
- Supply requests: anyone can request; the owner (대표원장) marks "주문완료"; the desk staff mark "도착". (Roles already enforced by existing triggers — keep.)

## Global Constraints

- UI language is Korean; match the surrounding inline-style / CSS-variable look (`var(--color-*)`); no new UI libraries.
- Next.js in this repo has breaking changes: consult `node_modules/next/dist/docs/` before using unfamiliar Next APIs (`proxy.ts` replaces middleware).
- Do NOT touch tables owned by the other app sharing the DB: `prescriptions`, `daily_records`, `reservations`, `monthly_goals` (schema/policies). Server code may keep reading/writing them as it does now.
- Never put secrets in the repo; `service_role` only in server code (`server-only` admin client).
- Every migration file is idempotent (re-runnable) and mirrored into `supabase/schema.sql`. Do not run migrations against the live DB.
- Keep tests green: `npx vitest run`, `npx tsc --noEmit`, `npm run build` must pass before each commit. Add Vitest tests for new pure logic.
- Commit per task with a `feat:`/`fix:` message ending with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Existing users must keep working: `master` code runs against the live DB that already has `staff.grade`.

---

### Task 1: Signup path fix + staff removal

**Files:** `src/lib/supabase/middleware.ts`, `src/app/signup/page.tsx`, `src/app/api/signup/route.ts`, `src/app/api/staff/remove/route.ts` (new), `src/app/(app)/staff-approval/page.tsx`, `supabase/migration_staff_removal.sql` (new) + `supabase/schema.sql`.

Requirements:
1. `POST /api/signup` currently 307-redirects to `/login` for anonymous users because `publicPaths` in `middleware.ts` lacks it. Make `/api/signup` reachable without a session (and only that API). Verify the `/signup` page then works end to end (form → pending account). Also make the signup route robust: unguarded `request.json()` → 400; trim/validate name (1–20 chars) and password (≥ 8 chars, as today); keep the 409 duplicate-name behaviour.
2. Owner-only `POST /api/staff/remove` with body `{ staffId }`: use `requireOwner()` FIRST (as the approve/grade routes do), then delete the auth user via the admin client (`admin.auth.admin.deleteUser`) which cascades the `staff` row. Refuse (400/404, Korean error) when the target is an owner, is yourself, or does not exist. Works for both `pending` (reject an application) and `approved` staff.
3. Deleting a staff member must NOT fail or delete their records: every FK that references `staff(id)` today is `NO ACTION` (see `supabase/schema.sql`: `created_by`, `updated_by`, `doctor_staff_id`, `assignee_staff_id`, `requested_by`, `ordered_by`, `received_by`, `sender_id`). In `migration_staff_removal.sql` re-create those FKs as `on delete set null` (find the actual constraint names with the `<table>_<column>_fkey` convention; use `alter table … drop constraint if exists … ; add constraint … foreign key … references staff(id) on delete set null`). `chat_room_members.staff_id` stays `on delete cascade`. Records keep existing; the "who" becomes empty. Mirror into `schema.sql` (change the inline `references staff(id)` to add `on delete set null` where the column is nullable — check none is `not null`; if one is `not null` keep NO ACTION and list it in your report).
4. UI in `/staff-approval`: a "삭제" button on each pending row (label "신청 거절") and each approved non-owner row, with a `window.confirm` naming the person and stating that their past records stay but the name is removed. Show API errors. Reload the list after success. Owner rows show no delete button.
5. Tests: unit-test any pure validation you extract; API behaviour is verified by the controller live.

Acceptance: build/tsc/vitest green; `curl -X POST /api/signup -d '{}'` on the dev server returns the route's 400 (not a 307); the removal route rejects non-owner (403), owner target, self, unknown id.

### Task 2: Row-level security — approved staff only

**Files:** `supabase/migration_rls_approved_only.sql` (new), `supabase/schema.sql`, `src/components/TodoChecklist.tsx` (assignee list), any place that lists staff names for pickers (chat invite, happy-call doctor, todos) — filter to approved.

Problem: policies on most tables check only `auth.role() = 'authenticated'`, so a signed-up but unapproved (pending) account can read/write patient data directly with the public anon key. Only the chat tables check `staff.status = 'approved'`.

Requirements:
1. Create `public.is_approved_staff()` — `language sql stable security definer set search_path = public`, returns `exists (select 1 from staff where id = auth.uid() and status = 'approved')`; `grant execute … to authenticated`; revoke from anon/public. (Look at how the chat policies already do the check and stay consistent.)
2. For EVERY table created by this app (list: `happy_call_patients, herb_medicine_prescriptions, diet_packages, diet_package_calls, happy_call_manual_entries, herb_inventory, herb_inventory_logs, non_covered_purchases, non_covered_products, daily_revenue, monthly_revenue_override, consult_summaries, todos, supply_items, supply_requests` plus the storage `chat-attachments` upload policy if it lacks the approved check), replace each policy's `auth.role() = 'authenticated'` (USING and WITH CHECK) with `public.is_approved_staff()`. Keep the same commands, names and any extra conditions (e.g. owner-only supply triggers, delete rules). Use `drop policy if exists … ; create policy …` so it is idempotent. The authoritative list of live policy names comes from `select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public'` — the controller will paste that output into `.superpowers/sdd/2026-09-20-ops-improvements/live-policies.txt` for you to read BEFORE writing the migration; policy names in `schema.sql` may differ from live.
3. `staff` table: keep the two policies working but tighten SELECT to `auth.uid() = id or public.is_approved_staff()` so a pending user still reads their OWN row (needed by the pending-approval gate in `middleware.ts`) but not everyone else's. Keep the column-level `grant update (name)` as is.
4. Do NOT change policies on `prescriptions`, `daily_records`, `reservations`, `monthly_goals` (other app).
5. Client code that lists staff for assignment/invite must only show `status = 'approved'` (`.eq('status','approved')`).
6. Mirror everything into `schema.sql`. Add a header comment in the migration explaining WHY (pending accounts could read patient data).

Acceptance: build/tsc/vitest green; migration idempotent; controller verifies live with temp accounts: approved staff can still use every page; a pending account gets 0 rows/denied on each table via PostgREST.

### Task 3: Happy-call completion flow + list

**Files:** `src/app/(app)/happy-call-list/page.tsx`, `src/lib/supabase/happyCallQueue.ts`, `src/lib/supabase/happyCallPatients.ts`, `src/components/TodayHappyCalls.tsx`, `src/lib/happyCallQueue*.ts` (new pure logic + tests), `supabase/migration_happy_call_results.sql` (new) + `schema.sql`, `src/lib/types.ts`.

Read first: `docs/superpowers/specs/2026-09-18-happy-call-design.md`, the four call sources (초진, 한약 처방, 린다이어트, 수동/비급여) and how each is completed today (`window.prompt` memo → done).

Requirements:
1. Replace the memo `window.prompt` with an inline result chooser per call: **통화완료**, **부재중**, **거부/연락불가** (optional memo). Record for every call source: `result`, `completed_by` (staff id), `completed_at`, `memo`, `attempts`. Add the needed columns via `migration_happy_call_results.sql` (idempotent `add column if not exists`), mirrored in `schema.sql`. Inspect each source table first; if a source has no per-call row (e.g. calls are computed from a patient's dates), store the result the way the current completion is stored and extend it minimally — document in the report.
2. **Retry rule (초진 calls only):** first 부재중 → the call is re-scheduled for the next day (attempt 2). A second 부재중 → closed with result "연락 안 됨". Other call types (한약/다이어트/비급여): 부재중 also re-schedules once to the next day, then closes the same way (owner said 1 retry applies to 초진; using the same rule for the others is the safe default — note it in the ledger as a ruling).
3. **내일로 미루기** button on every open call: sets its due date to tomorrow (Asia/Seoul date). No weekend/holiday logic anywhere.
4. Overdue (due before today) open calls stay listed, sorted first, with a red "N일 지남" badge.
5. **되돌리기:** a just-completed call can be reopened (small "되돌리기" on the completed row, visible in a collapsed "오늘 완료한 콜" section).
6. The list rows show: 유형, 환자명, **몇 차 콜**(1차/2차 재시도), **전화번호** as a `tel:` link plus a "복사" button, **진료의**, 예정일, memo, and — when completed — 결과/완료자 이름/시각. Where the source table lacks a phone number, show "-" (Task 4 adds phone to 초진 registration).
7. Home widget `TodayHappyCalls` uses the same shared logic; add a count of open calls (due ≤ today) to its header. Extract the shared status logic (due today / overdue / retry / close) into a pure tested module `src/lib/happyCallQueue.ts` (or a new file next to it).
8. Fix `TodayHappyCalls`: if ONE of the queries fails, show a clear error and do NOT show "대상이 없어요".
9. Tests for the retry/postpone/overdue logic including day boundaries (use fixed dates; KST date handling).

Acceptance: build/tsc/vitest green; walk through 3 timelines in the report (answered / no-answer twice / postponed).

### Task 4: Happy-call registration — 초진·재초진 candidates and reconciliation

**Files:** `src/app/(app)/happy-call-register/page.tsx`, `src/lib/supabase/happyCallPatients.ts`, `src/lib/happyCallStats.ts` (+test), `src/lib/firstVisit.ts` (new, pure + test), `supabase/migration_happy_call_first_visit.sql` (new) + `schema.sql`, `src/lib/types.ts`.

Requirements:
1. Add to `happy_call_patients`: `chart_no text`, `phone text`, `visit_kind text not null default '초진' check in ('초진','재초진')`. Idempotent migration + schema mirror.
2. **Candidates panel** at the top of the page for the selected date: read that date's reservations (the same server/API path the reservations page uses — do not query `reservations` from the browser with new policies) and list patients that are not yet registered (match by chart number, else by name+phone). Each candidate shows name, chart no, phone, 주치의, and a suggested kind computed by pure `classifyVisit(previousVisitDates, today)`: no earlier reservation on record → "초진(추정)"; last earlier visit ≥ 3 calendar months before → "재초진"; otherwise "재진(등록 불필요)" (hidden by default). One click "초진 등록"/"재초진 등록" registers the patient (copying chart_no, phone, doctor, first-visit date). Note in the UI that history only exists since the dashboard started, so "초진(추정)" must be confirmed by staff.
3. **Reconciliation banner:** compare the closing figure for the date (신규환자수 saved from 일일결산, see `daily_revenue` / `dailyRevenue.ts`; if no such field exists, use the count of candidates suggested as 초진/재초진) with the number registered; show "오늘 초진/재초진 N명 중 M명 등록 — K명 누락" in red when K > 0, green when 0.
4. Fix the auto-save-on-blur bug: typing a name and tabbing away must not insert a row with default doctor/구분. Save only when name AND 진료의 AND 구분 are set (or via an explicit "등록" button — pick the simpler; keep keyboard flow).
5. Registered rows can be edited (already inline?) and **deleted** (add DELETE policy in the migration — restricted to approved staff — and a confirmed "삭제" button).
6. Stats: 재초진 counts as a first visit for 재진율/삼진율 (same formulas). Verify the 삼진 definition = 3 visits within 21 days after the first visit (read `happyCallStats.ts` and its tests; fix + test if it differs, e.g. third visit date must be ≤ first visit + 21 days). Show "재내원 미입력 N명" warning above the table when matured patients have empty revisit dates. Default the stats period to the most recent completed week so 이탈/삼진 are not always "-" (keep a way to pick this week).
7. Register phone on manual registration too (optional field).

Acceptance: build/tsc/vitest green; `classifyVisit` unit tests cover: no history, last visit 2 months ago, exactly 3 months, 5 months, same-day duplicate.

### Task 5: Closing safeguards, atomic reservation replace, next-day sheet

**Files:** `src/components/PasteImportWidget.tsx`, `src/lib/pasteImport.ts` (+test), `src/app/api/reservation-paste/route.ts`, `src/lib/reservations/dailyRecords.server.ts`, `src/components/reservations/*` (print), `src/app/(app)/reservations/reservations.css`, `supabase/migration_replace_reservations_rpc.sql` (new) + `schema.sql`, `src/lib/reservations/dashboardStats.ts`, `src/components/reservations/WeeklyDashboard.tsx`.

Requirements:
1. **Order trap:** the daily-closing form prefills from the SAVED reservation list. After a reservation paste is saved, the daily-closing form must re-compute its prefilled fields, so either paste order works.
2. **Safeguards on saving a daily closing:** confirm dialog when (a) 총진료비 is 0 or empty, (b) visit count is 0, (c) the date is in the future (Asia/Seoul today), (d) a closing for that date already exists ("이미 저장된 마감이 있어요. 덮어쓸까요?" with old vs new total). Non-numeric cells in a pasted table must be reported (highlight/skip with a message), not silently turned into 0.
3. **Missing-closing alert:** a small helper `missingClosingDates(saved, today)` (pure + tests) returning yesterday if there is no `daily_revenue` row for it. Show a banner on the reservations page and expose the helper for the home page (Task 12): "어제(9/19) 마감이 아직 입력되지 않았어요". Only YESTERDAY is checked (no history nagging).
4. **Reservation replace:** the paste API deletes then inserts per date with no transaction. Create a Postgres function `replace_reservations(p_date date, p_rows jsonb)` (security definer, executed only by service_role; do the delete+insert atomically) in the migration and call it from the server route. Read `dailyRecords.server.ts` to keep the existing shape (only touch the data this app already writes; the `reservations` table belongs to the other app — read its columns from the live-shaped code, do not alter it). Before replacing, the UI must show a confirm with per-date "기존 N명 → 새 N명" counts; a paste with far fewer rows than existing (new < 50% of old) needs an extra warning.
5. **Next-day sheet:** on the reservations page add a "내일 예약 시트 인쇄" shortcut that opens tomorrow's date and prints. Printing layout: grouped by 주치의 with a page break between doctors, larger font (≥ 10pt; currently ~6pt), columns 예약시간/성함/차트번호/휴대전화/치료부위/치료/특이사항, and a visible "초진" marker for patients with no earlier reservation (reuse `classifyVisit` from Task 4 if present, else a simple no-history check).
6. Rename the "모두 삭제" button to "입력칸 비우기" (it only clears inputs) and its confirmation text accordingly.
7. Label 예약률 / 부도취소율 in the monthly panel as "이번 주" (visible text, not only a tooltip). Fix the print summary that sums legacy columns (`dashboardStats.ts` ~ lines 34-43) so it agrees with the panel's 한약/다이어트 counts, or remove those two numbers from the print summary if the source is unavailable — state which in the report.

Acceptance: build/tsc/vitest green; tests for pasteImport numeric handling and `missingClosingDates`.

### Task 6: Revenue panel — override baseline, 객단가, motivation

**Files:** `src/lib/monthlyFigures.ts` (+test), `src/lib/monthlySummary.ts`, `src/components/MonthlyStatsPanel.tsx`, `src/lib/supabase/dailyRevenue.ts`, `supabase/migration_override_as_of.sql` (new) + `schema.sql`, `src/lib/pasteImport.ts` if the month-end paste needs the as-of date.

Facts: the live DB has `monthly_revenue_override` for 2026-09 = 47,338,780 (avg 27.4 visits/day) saved 2026-09-19, and one `daily_revenue` row (2026-09-19, 1,610,250, 18 visits). Today the override REPLACES the daily sum, so new daily closings never move the total.

Requirements:
1. Add `as_of_date date` to `monthly_revenue_override` (nullable). New rule: month total = override.total + sum(daily_revenue where date > as_of_date and in month); visit total likewise; the daily-average uses total visits / days elapsed (define carefully; keep the existing formula's meaning and document it). When `as_of_date` is null (legacy rows) keep current behaviour but show a small warning "월말결산 값이 있어 일일 마감이 합산되지 않아요 (기준일 없음)". When saving an override via the month-end paste, set `as_of_date` to the latest date found in the pasted table (日자/내원/총진료비 rows) or, if absent, the Asia/Seoul date of the paste. Backfill the existing 2026-09 row's `as_of_date` in the migration to `'2026-09-19'` (the controller has confirmed this with live data; comment it).
2. Add **객단가** = 총진료비 ÷ 총 내원 인원 tile (skip when denominator is 0).
3. Add motivation lines under 총매출 (visible to all staff): 목표까지 남은 금액; "남은 N일 동안 하루 평균 X원이 필요해요"; 이 속도(현재 일평균 매출)로 가면 월말 예상 Y원 (Z% of goal); compare to the previous month same-date-to-date total when available ("지난달 같은 날 대비 +N%"); when the goal is reached show a celebratory line "🎉 목표 달성!". Calendar-day pace is correct (clinic is open 7 days). Keep the existing "매출향상이 필요해요"/"안정적이에요" indicator.
4. Pure functions with tests in `monthlyFigures.test.ts` for: override with as_of, override without as_of, no override, month boundaries, zero denominators, goal reached, projections.

Acceptance: build/tsc/vitest green; panel renders the live September numbers sanely (controller checks in browser).

### Task 7: Removals + home summary strip + home hygiene

**Files:** `src/app/(app)/page.tsx`, `src/app/(app)/treatment-timer/**` (delete), `src/lib/treatmentCatalog.ts` (delete if unused elsewhere), `src/app/(app)/event-patients/**` (delete), `src/lib/favoriteLinks.ts` (only if it links these), `src/components/NavCard.tsx`, `src/components/QuoteBanner.tsx`, `src/components/TodoChecklist.tsx`, `src/lib/supabase/todos.ts`, `src/app/(app)/error.tsx`, `loading.tsx`, `not-found.tsx` (new), `src/components/HomeSummaryStrip.tsx` (new), `src/lib/supabase/homeSummary.ts` (new).

Requirements:
1. Delete the 치료실 타이머 and 이벤트 환자 목록 pages, their home cards and any dead code/tests/imports. Keep the 비대면진료 알람 card, but make its page a friendly "준비 중" page with a back link (mention the planned forms: 공진단, 한약 문진표, 보폐고엔오).
2. **Home summary strip** (top of home, all staff): 오늘 예약 N명 · 오늘 초진/재초진 후보 N명 · 미완료 해피콜 N건 (link) · 주문 대기/도착 대기 물품 N건 (link) · 재고 부족 약재 N개 (link; if the low-stock threshold feature from Task 8 is not present yet, query `low_stock_threshold` when set and show 0 otherwise) · 어제 마감 미입력 알림 (uses `missingClosingDates` from Task 5) · owner only: 승인 대기 직원 N명 (link to /staff-approval). Each chip is a link to its page; hide chips with nothing to report except 오늘 예약. All queries are server-side, resilient to a single failing query (show what works), and use Asia/Seoul dates.
3. Group the remaining cards under headings (예: "매일 쓰는 도구", "환자 관리", "운영") — same NavCard component; keep the owner-only 직원 승인 card.
4. `QuoteBanner`: pick the phrase by date (stable per day) instead of always the first; keep the "다른 문구" button.
5. `TodoChecklist`/`todos.ts`: current query is ordered by due date ascending with limit 300, so old completed items eventually hide today's tasks. Fetch open todos (any date) + completed todos from the last 7 days, and add an option to default the filter to "내 것" (remember the choice in localStorage inside try/catch). Return a skeleton instead of `null` while loading.
6. Add `error.tsx`, `loading.tsx` and `not-found.tsx` for the `(app)` group with Korean text and a way back home.

Acceptance: build/tsc/vitest green; no references to removed pages remain (grep).

### Task 8: Herb inventory — bags only, low-stock, atomic updates, ordering list

**Files:** `src/app/(app)/herb-inventory/page.tsx`, `src/lib/supabase/herbInventory.ts`, `src/lib/herbEntryParser.ts` (+test), `supabase/migration_herb_inventory_v2.sql` (new) + `schema.sql`.

Requirements:
1. Unit is ONLY 봉지: remove any other unit concept from UI/labels; quantities are non-negative integers ("봉지").
2. **Low-stock threshold UI:** each herb row lets staff set 부족 기준(봉지) (the `low_stock_threshold` column exists; the UI to edit it does not). Rows at or below the threshold are highlighted; a "부족한 약재" panel at the top lists them.
3. **발주 필요 목록:** a button "발주 목록 복사" that copies "약재명 — 현재 N봉지 (기준 M) — 권장 발주 K봉지" lines for all short herbs (K = threshold*2 − current, min 1; make this formula a pure, tested function and state it in the UI as a suggestion).
4. **Atomic stock changes:** bulk 입고/사용 currently does read-modify-write per herb from the browser (concurrent edits overwrite; retry after a partial failure double-applies; negatives silently clamp). Create a Postgres function `apply_herb_stock_changes(p_changes jsonb)` (security invoker so RLS applies; runs all changes in one transaction; rejects the whole batch if any herb would go negative, returning which one) and use it from the page. Log every change into `herb_inventory_logs` inside the function (who = auth.uid()).
5. Show a change history (last 50 log lines: 시각, 약재, 변화량, 처리자 이름) in a collapsible section.
6. Keep the "여러 약재 한 번에" text parsing behaviour; update parser tests if you touch it. Unknown herb names in a "사용" batch are reported, not silently ignored.

Acceptance: build/tsc/vitest green; SQL function idempotent (`create or replace`).

### Task 9: Supply requests — aging, duplicates, arrival visibility

**Files:** `src/app/(app)/supply-requests/page.tsx`, `src/lib/supabase/supplyRequests.ts`, `src/lib/supplyHelpers.ts` (+test).

Requirements:
1. Each open request shows an aging badge: "신청 N일째" (yellow ≥ 3 days, red ≥ 7) for 신청됨 (not ordered) and "주문 후 N일째" for 주문완료 (not arrived); pure tested helper.
2. Duplicate warning when a new request's item name (normalized: trim, lowercase, spaces removed) matches an open (not arrived) request — show the existing one and require confirming "그래도 신청".
3. The 진행 중 tab groups/sorts oldest first; add "주문 대기 N건 · 도착 대기 N건" counters at the top.
4. Keep the existing role rules (anyone requests, owner marks 주문완료 — enforced by DB trigger, desk marks 도착): make the UI hide/disable the 주문완료 button for non-owners with a tooltip text "대표원장이 주문 체크해요" rather than failing on click.
5. Export a small server-callable count helper (`countOpenSupplyRequests`) for the home strip if Task 7 has not created one.

Acceptance: build/tsc/vitest green.

### Task 10: 비급여 현황 — filters, averages, monthly view, data fixes

**Files:** `src/app/(app)/non-covered-patients/page.tsx` (976 lines — split into components under `src/components/non-covered/` as needed), `src/lib/supabase/nonCoveredPurchases.ts` (+test).

Requirements:
1. Event feature stays as is ("이벤트 환자 목록" page was removed; the 구분/이벤트 tabs and the 이벤트 실적 비교 panel remain).
2. Add a month selector (default current month, "전체" option) and show per product: 건수, 총액, 평균단가, and per 구분 (일반 / each event) side by side for the selected month; plus a small month-by-month table (last 6 months: 건수/금액 per 구분). Pure aggregation functions in `src/lib/nonCoveredStats.ts` with tests.
3. Fix silent truncation: the query uses `limit(1000)`; page through results (or remove the cap safely) so old rows are never dropped. Fix the "일반" comparison being all-time versus a dated event by applying the same date window in the comparison.
4. Deleting a purchase must also delete its auto-generated happy calls; editing the 수령일/처방일수 must re-sync them (there is an unused `updatePurchaseHappyCallDate` — wire it up or remove it, whichever is correct after reading the code). Creation of purchase + its 3 calls should not leave orphans on failure (best-effort rollback of the purchase if call creation fails).
5. Show 등록자 (created_by name) in the table. 금액 is required when the product has a price? — keep optional, but show a "금액 미입력" chip on rows without an amount and exclude them from averages (count them separately).
6. Reduce the entry form to the essential fields visible by default (환자명, 차트번호, 연락처, 구분, 상품, 금액, 구매일); the rest under "자세히".

Acceptance: build/tsc/vitest green; page size per file < ~400 lines.

### Task 11: Consult-summary limits, backup export, headers, KST, docs

**Files:** `src/app/api/consult-summary/route.ts`, `src/app/(app)/consult-summary/page.tsx`, `src/lib/supabase/consultSummaries.ts`, `src/app/(app)/backup/page.tsx` + `src/app/api/export/route.ts` (new), `next.config.mjs`, `src/lib/kst.ts` (new) + users of server-local dates, `.env.local.example`, `README.md`, `supabase/migration_consult_retention.sql` (only if needed).

Requirements:
1. Consult summary: cap the input at 30,000 characters (server and UI counter, Korean error); rate limit per staff (max 60 summaries per rolling day, count from `consult_summaries.created_at` by `created_by`); do not echo raw upstream error messages to the client (log server-side, return a generic Korean message). Show the saved summaries list with a way to open the saved 원문 + 요약 (read-only). NO delete UI, NO auto-purge: add a comment/README note "상담 기록은 10년 보관". The staff-removal FK change (Task 1) already keeps the records.
2. **Backup export (owner only):** a `/backup` page (owner-gated like other owner pages; link from the owner-only card area, not the main grid) with buttons that download CSV (UTF-8 with BOM so Excel shows Korean) for: 예약 명단(월 선택), 일일 결산, 초진 해피콜, 비급여 구매, 상담 요약, 한약재 재고, 물품신청. The API route `GET /api/export?table=…&month=…` uses `requireOwner()` first, uses the RLS client where possible (owner is approved), streams no more than needed. Whitelist table names; never interpolate raw input.
3. Add `src/lib/kst.ts` (`todayKst()`, `currentMonthKst()`, `addDaysKst()`) with tests and use it in server-side code that currently uses server-local time (`monthlySummary.ts` currentMonth/getWeeklyRates, herb-print defaults `toISOString`, any new code from earlier tasks if not yet using it).
4. `next.config.mjs`: add security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera/microphone/geolocation). Verify pages still render (embedded iframes are not used by the app; check herb-print/reservations do not rely on framing).
5. `.env.local.example`: add `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` placeholders (empty). Update README: setup step 3 uses `grade = '대표원장'`; describe signup/approval/removal, the backup page, DB migrations list (all `supabase/migration_*.sql` in order), backup advice (Supabase free tier has no automatic backup → use the backup page weekly), and current cards.

Acceptance: build/tsc/vitest green.
