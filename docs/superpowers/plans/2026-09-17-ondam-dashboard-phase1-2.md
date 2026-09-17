# 경희온담한의원 운영 대시보드 Phase 1 & 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the layout/navigation/home shell and the Supabase Auth + data-model groundwork for the ondam-dashboard app, so the 7 feature pages can each be built as a follow-up increment.

**Architecture:** Next.js (App Router, TypeScript) SPA-style app. A left sidebar (10 items: 홈 + 9 destinations, 2 of which are external links) wraps every authenticated page. Supabase Auth (email/password, via `@supabase/ssr`) gates the whole app through `src/proxy.ts`. Unlike the reservation app (dest-auto), this project has real per-user identity, so the public `anon` key + RLS restricted to `authenticated` is the correct, standard Supabase pattern here — there is no service-role key in the app's own runtime env.

**Tech Stack:** Next.js (latest), React (latest), TypeScript, `@supabase/ssr` + `@supabase/supabase-js`, Vitest for unit tests.

**Spec:** [docs/superpowers/specs/2026-09-17-ondam-dashboard-design.md](../specs/2026-09-17-ondam-dashboard-design.md) — this plan covers Phase 1 and Phase 2 only, per the spec's section 2.

## Global Constraints

- Node.js and npm are already available on this machine (confirmed in the sibling `dest-auto` project).
- No CSS framework — plain inline styles, matching `dest-auto`'s established convention. No Tailwind, no UI kit.
- Package manager: npm. Dependency versions are resolved by `npm install <pkg>@latest` at task time, not hand-pinned.
- Auth is Supabase Auth (email/password), not the single-shared-password pattern used in `dest-auto` — every task involving login must use real per-user sessions via `@supabase/ssr`.
- The app's own runtime env vars are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` only. No `SUPABASE_SERVICE_ROLE_KEY` is used by the app itself (see Prerequisites — the service-role key is only used once, outside the app, to seed the two owner accounts).
- File name/function name for the auth gate must be `src/proxy.ts` exporting `proxy` (NOT `middleware.ts`/`middleware`) — Next.js 16 deprecated and renamed this convention; `dest-auto` hit a real bug from getting this wrong. Place it under `src/` (next to `src/app/`), not the project root.
- Automated tests (Vitest) are for pure logic only; this plan has none yet (Phase 1/2 is layout + auth + schema, no business logic). Verify UI/auth manually via `npm run dev`, matching `dest-auto`'s testing strategy.

## Prerequisites (manual, done by the user or the controller before certain tasks — not implementation tasks)

1. **Create a new Supabase project.** ⚠️ This account is already on the free tier's 2-active-project limit (confirmed while building `dest-auto` — creating a 3rd project failed with a quota error). Before Task 2, resolve this the same way as last time: either pause/delete/upgrade an existing project, or — if the user prefers not to touch existing projects — share this app's tables inside the existing `hanyak-ondam` project with a `dashboard_` table-name prefix to avoid any collision with its `prescriptions` table. Confirm which path with the user; don't assume.
2. Once a project exists, run `supabase/schema.sql` (created in Task 2) in the SQL Editor (or via the Management API, same pattern as `dest-auto`).
3. Copy the **Project URL** and **anon public key** into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```
4. **Seed the two initial owner accounts** (박소은, 김동규) — this is a one-off admin action, not app code:
   - Create each as a Supabase Auth user (Dashboard → Authentication → Add user, or the Management API's Auth Admin endpoints with a service-role key used only for this one-off step, never stored in the app's env).
   - Insert a matching row into `staff` for each: `id` = the new auth user's id, `name`, `role = 'owner'`.
5. Deploying to Vercel is out of scope for this plan (same reasoning as `dest-auto`) — a short follow-up once Phase 1/2 works locally, whenever the user asks for it.

---

### Task 1: Project scaffold (Next.js + TypeScript + Vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `next-env.d.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.local.example`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/page.tsx`
- Create: `src/lib/example.ts`
- Test: `src/lib/example.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a runnable Next.js app skeleton. The `@/*` import alias resolves to `src/*` (used by every later task).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "ondam-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install next@latest react@latest react-dom@latest
npm install -D typescript@latest @types/node@latest @types/react@latest @types/react-dom@latest vitest@latest
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 5: Write `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 7: Write `.gitignore`**

```
node_modules/
.next/
.env.local
.env*.local
dev.log
tsconfig.tsbuildinfo
.vercel
```

- [ ] **Step 8: Write `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 9: Write `src/app/globals.css`**

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
}

button {
  cursor: pointer;
}

a {
  color: inherit;
}
```

- [ ] **Step 10: Write `src/app/layout.tsx`** (placeholder — replaced fully in Task 4)

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '경희온담한의원 운영 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Write a placeholder `src/app/page.tsx`** (replaced fully in Task 5)

```tsx
export default function HomePage() {
  return <main style={{ padding: 24 }}>준비 중입니다.</main>;
}
```

- [ ] **Step 12: Write the failing test for the Vitest pipeline itself**

`src/lib/example.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { add } from './example';

describe('add', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
```

- [ ] **Step 13: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `src/lib/example.ts` does not exist yet.

- [ ] **Step 14: Write minimal implementation**

`src/lib/example.ts`:
```ts
export function add(a: number, b: number): number {
  return a + b;
}
```

- [ ] **Step 15: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (1 test).

- [ ] **Step 16: Verify the Next.js toolchain itself**

Run: `npm run build`
Expected: build succeeds and prints a route summary including `/`.

Run: `npm run dev`, open `http://localhost:3000`
Expected: page shows "준비 중입니다." Stop the dev server after confirming.

- [ ] **Step 17: Delete the throwaway example files**

Delete `src/lib/example.ts` and `src/lib/example.test.ts`.

- [ ] **Step 18: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.mjs next-env.d.ts vitest.config.ts .gitignore .env.local.example src/app
git commit -m "chore: scaffold Next.js + TypeScript + Vitest project"
```

---

### Task 2: Supabase clients (browser/server/middleware) + types + schema

**Files:**
- Create: `src/lib/types.ts`
- Create: `supabase/schema.sql`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `Staff` type; `createClient()` (browser, from `src/lib/supabase/client.ts`) and `createClient()` (server, from `src/lib/supabase/server.ts` — different file, same exported name, never imported from the same file); `updateSession(request)` (used by Task 3's `src/proxy.ts`).

This task has no automated test — it's a type declaration, a SQL file, and three thin Supabase client wrappers with no business logic. Verified by `npm run build` succeeding (nothing calls these yet, so a missing `.env.local` won't break the build — the two `createClient()` functions read env vars lazily inside function bodies, not at module load time, so they don't throw until actually invoked).

- [ ] **Step 1: Write `src/lib/types.ts`**

```ts
export interface Staff {
  id: string;
  name: string;
  role: 'owner' | 'staff';
}
```

- [ ] **Step 2: Write `supabase/schema.sql`**

```sql
create table if not exists staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

alter table staff enable row level security;

-- Every logged-in user can see the staff list (used to render names in the UI).
-- This is safe: anon (not-logged-in) requests are rejected by auth.role() != 'authenticated',
-- and there is no public anon-key-only access path in this app (unlike dest-auto, this
-- app has real Supabase Auth sessions, so RLS scoped to `authenticated` is the correct,
-- standard pattern — not a shortcut).
create policy "authenticated can read staff" on staff
  for select using (auth.role() = 'authenticated');

-- Users can only edit their own row (e.g. changing their own display name later).
-- Row creation is NOT exposed here — the two initial owner accounts are seeded once,
-- out-of-band, via the Supabase Auth Admin API (see the plan's Prerequisites section).
create policy "users can update own staff row" on staff
  for update using (auth.uid() = id);
```

- [ ] **Step 3: Install the Supabase packages**

```bash
npm install @supabase/ssr@latest @supabase/supabase-js@latest
```

- [ ] **Step 4: Write `src/lib/supabase/client.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 5: Write `src/lib/supabase/server.ts`**

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, which can't set cookies.
            // Harmless as long as src/proxy.ts (Task 3) refreshes the session.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 6: Write `src/lib/supabase/middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 7: Verify types compile**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/supabase supabase/schema.sql package.json package-lock.json
git commit -m "feat: add Supabase clients, staff type, and schema"
```

---

### Task 3: Auth gate (`src/proxy.ts`) + login page

**Files:**
- Create: `src/proxy.ts`
- Create: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `updateSession` (Task 2's `src/lib/supabase/middleware.ts`), `createClient` (Task 2's `src/lib/supabase/client.ts`)
- Produces: the `/login` route and the auth gate covering every other route. Task 4's Sidebar renders a logout button that calls `supabase.auth.signOut()` the same way this task's login page calls `signInWithPassword`.

- [ ] **Step 1: Write `src/proxy.ts`** (project root is `src/`, so this file sits next to `src/app/` — NOT at the repo root, and it is named `proxy.ts`/exports `proxy`, NOT `middleware.ts`/`middleware`, per the Global Constraints note)

```ts
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 2: Write `src/app/login/page.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>경희온담한의원 운영 대시보드</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="이메일"
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="비밀번호"
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <button type="submit" style={{ width: '100%', padding: 8 }}>
          로그인
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Manually verify the gate**

Complete the plan's Prerequisites (real Supabase project + `.env.local` + at least one seeded owner account) before this step. Run `npm run dev`, open `http://localhost:3000`:
- Expected: redirected to `/login`.
- Enter a wrong password → error message shown, still on `/login`.
- Enter a seeded owner's real email/password → redirected to `/`, and reloading `/` no longer bounces to `/login` (session cookie persists).

If Prerequisites aren't done yet when this task runs, note that in the report and mark this step as deferred rather than skipped — Task 7's end-to-end check will need it done.

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts src/app/login
git commit -m "feat: add Supabase Auth gate and login page"
```

---

### Task 4: Sidebar component + root layout wiring

**Files:**
- Create: `src/components/Sidebar.tsx`
- Modify: `src/app/layout.tsx` (replace the Task 1 placeholder entirely)

**Interfaces:**
- Consumes: `createClient` (Task 2, both client and server versions), `Staff` type (Task 2)
- Produces: `Sidebar` component (`{ staffName: string | null }` props). Nothing later depends on this beyond `layout.tsx` itself.

- [ ] **Step 1: Write `src/components/Sidebar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface NavItem {
  href: string;
  label: string;
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈' },
  { href: 'https://kh-ondam-reservation.vercel.app', label: '예약관리', external: true },
  {
    href: 'https://scratch-2026-09-09-c5228e.vercel.app',
    label: '한약 복용법 출력',
    external: true,
  },
  { href: '/happy-call-register', label: '초진환자 해피콜' },
  { href: '/treatment-timer', label: '치료실 타이머' },
  { href: '/happy-call-list', label: '해피콜 목록' },
  { href: '/non-covered-patients', label: '비급여 환자 목록' },
  { href: '/event-patients', label: '이벤트 환자 목록' },
  { href: '/remote-consult-alerts', label: '비대면진료 알람' },
  { href: '/supply-requests', label: '물품신청' },
];

interface SidebarProps {
  staffName: string | null;
}

export function Sidebar({ staffName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      style={{
        width: 220,
        borderRight: '1px solid #ddd',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h2 style={{ fontSize: 16, marginBottom: 16 }}>경희온담한의원</h2>
      <nav style={{ flex: 1 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              {item.external ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', padding: 8, textDecoration: 'none' }}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  href={item.href}
                  style={{
                    display: 'block',
                    padding: 8,
                    textDecoration: 'none',
                    background: pathname === item.href ? '#e0ecff' : 'transparent',
                  }}
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div style={{ borderTop: '1px solid #ddd', paddingTop: 12 }}>
        <p style={{ fontSize: 13, marginBottom: 8 }}>{staffName ?? '로그인됨'}</p>
        <button onClick={handleLogout} style={{ width: '100%', padding: 6 }}>
          로그아웃
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Write `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';

export const metadata: Metadata = {
  title: '경희온담한의원 운영 대시보드',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let staffName: string | null = null;
  if (user) {
    const { data: staff } = await supabase
      .from('staff')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();
    staffName = staff?.name ?? user.email ?? null;
  }

  return (
    <html lang="ko">
      <body>
        {user ? (
          <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar staffName={staffName} />
            <main style={{ flex: 1, padding: 24 }}>{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
```

Note: this conditionally wraps children in the sidebar layout only when `user` exists — `/login` itself has no `user`, so it renders full-page without the sidebar, which is what step 3's manual check expects.

- [ ] **Step 3: Verify types compile**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual check (only if Prerequisites are done)**

`npm run dev`, log in with a seeded owner account. Confirm the sidebar shows all 10 items, the logged-in name appears at the bottom, and clicking "로그아웃" returns you to `/login`. If Prerequisites aren't done yet, defer this to Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/app/layout.tsx
git commit -m "feat: add sidebar navigation and wire it into the root layout"
```

---

### Task 5: NavCard component + home page (9 cards)

**Files:**
- Create: `src/components/NavCard.tsx`
- Modify: `src/app/page.tsx` (replace the Task 1 placeholder entirely)

**Interfaces:**
- Consumes: nothing new
- Produces: `NavCard` component (`{ href: string, label: string, external?: boolean }`). Nothing later depends on this beyond `page.tsx` itself.

- [ ] **Step 1: Write `src/components/NavCard.tsx`**

```tsx
import Link from 'next/link';
import type { CSSProperties } from 'react';

interface NavCardProps {
  href: string;
  label: string;
  external?: boolean;
}

const CARD_STYLE: CSSProperties = {
  display: 'block',
  padding: 24,
  border: '1px solid #ddd',
  borderRadius: 8,
  textDecoration: 'none',
  color: '#111',
  fontWeight: 600,
  textAlign: 'center',
};

export function NavCard({ href, label, external }: NavCardProps) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={CARD_STYLE}>
        {label}
      </a>
    );
  }

  return (
    <Link href={href} style={CARD_STYLE}>
      {label}
    </Link>
  );
}
```

- [ ] **Step 2: Write `src/app/page.tsx`**

```tsx
import { NavCard } from '@/components/NavCard';

const CARDS: { href: string; label: string; external?: boolean }[] = [
  { href: 'https://kh-ondam-reservation.vercel.app', label: '예약관리', external: true },
  {
    href: 'https://scratch-2026-09-09-c5228e.vercel.app',
    label: '한약 복용법 출력',
    external: true,
  },
  { href: '/happy-call-register', label: '초진환자 해피콜' },
  { href: '/treatment-timer', label: '치료실 타이머' },
  { href: '/happy-call-list', label: '해피콜 목록' },
  { href: '/non-covered-patients', label: '비급여 환자 목록' },
  { href: '/event-patients', label: '이벤트 환자 목록' },
  { href: '/remote-consult-alerts', label: '비대면진료 알람' },
  { href: '/supply-requests', label: '물품신청' },
];

export default function HomePage() {
  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>경희온담한의원 운영 대시보드</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}
      >
        {CARDS.map((card) => (
          <NavCard key={card.href} href={card.href} label={card.label} external={card.external} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify types compile and the card count matches the spec**

Run: `npm run build` — expected: succeeds.
Count the `CARDS` array by hand: must be exactly 9 entries (2 `external: true`, 7 without).

- [ ] **Step 4: Commit**

```bash
git add src/components/NavCard.tsx src/app/page.tsx
git commit -m "feat: add home page with 9 navigation cards"
```

---

### Task 6: 7 placeholder feature pages

**Files:**
- Create: `src/app/happy-call-register/page.tsx`
- Create: `src/app/treatment-timer/page.tsx`
- Create: `src/app/happy-call-list/page.tsx`
- Create: `src/app/non-covered-patients/page.tsx`
- Create: `src/app/event-patients/page.tsx`
- Create: `src/app/remote-consult-alerts/page.tsx`
- Create: `src/app/supply-requests/page.tsx`

**Interfaces:**
- Consumes: nothing (each is a static placeholder)
- Produces: nothing later depends on these — each gets fully replaced when that feature's own brainstorm/spec/plan cycle happens.

These 7 files are identical in shape (one heading, one message) — this is a legitimate batch: same-shape work, no per-file judgment needed. Write all 7 in one pass.

- [ ] **Step 1: Write all 7 files**

`src/app/happy-call-register/page.tsx`:
```tsx
export default function Page() {
  return <h1>초진환자 해피콜 — 준비 중입니다</h1>;
}
```

`src/app/treatment-timer/page.tsx`:
```tsx
export default function Page() {
  return <h1>치료실 타이머 — 준비 중입니다</h1>;
}
```

`src/app/happy-call-list/page.tsx`:
```tsx
export default function Page() {
  return <h1>해피콜 목록 — 준비 중입니다</h1>;
}
```

`src/app/non-covered-patients/page.tsx`:
```tsx
export default function Page() {
  return <h1>비급여 환자 목록 — 준비 중입니다</h1>;
}
```

`src/app/event-patients/page.tsx`:
```tsx
export default function Page() {
  return <h1>이벤트 환자 목록 — 준비 중입니다</h1>;
}
```

`src/app/remote-consult-alerts/page.tsx`:
```tsx
export default function Page() {
  return <h1>비대면진료 신청 알람 — 준비 중입니다</h1>;
}
```

`src/app/supply-requests/page.tsx`:
```tsx
export default function Page() {
  return <h1>물품신청 — 준비 중입니다</h1>;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run build`
Expected: succeeds, route list includes all 7 new paths plus `/`, `/login`.

- [ ] **Step 3: Commit**

```bash
git add src/app/happy-call-register src/app/treatment-timer src/app/happy-call-list src/app/non-covered-patients src/app/event-patients src/app/remote-consult-alerts src/app/supply-requests
git commit -m "feat: add placeholder pages for the 7 feature routes"
```

---

### Task 7: End-to-end verification + README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-6
- Produces: nothing later depends on this file.

- [ ] **Step 1: Confirm Prerequisites are complete**

If the Supabase project, `.env.local`, and at least one seeded owner account aren't done yet, do them now (see the plan's Prerequisites section) — this task can't be meaningfully verified without them.

- [ ] **Step 2: Run the full manual acceptance check**

With `npm run dev` running:
1. Open `http://localhost:3000` while logged out → redirected to `/login`.
2. Log in with a seeded owner's email/password → redirected to `/`, sidebar visible with 10 items, logged-in name shown at the bottom.
3. Click each of the 7 internal cards on the home page → each shows its "준비 중입니다" placeholder, sidebar stays visible and correctly highlights the active item.
4. Click "예약관리" and "한약 복용법 출력" → each opens in a new tab at the real external URL.
5. Click "로그아웃" → returns to `/login`; reloading any internal URL directly now redirects back to `/login`.

- [ ] **Step 3: Confirm there's nothing to test yet (expected, not a failure)**

Phase 1/2 has no pure business logic — the Task 1 pipeline-proof test was deleted in that task's own Step 17, and no later task added a real one. Run: `npm run test`
Expected: Vitest exits non-zero with "No test files found" (or equivalent) — this is the correct, expected state for this plan, not a regression. Do not try to make this pass by adding a placeholder test; the first real test file arrives with the first feature page that has actual logic to test.

- [ ] **Step 4: Write `README.md`**

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add setup README"
```
