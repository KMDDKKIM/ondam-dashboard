# 사내 채팅 (토픽 + 채팅방) — 설계 문서

- 날짜: 2026-09-18
- 상태: 승인 대기
- 범위: 대시보드에 JANDI 스타일의 실시간 사내 채팅을 추가한다. 업무 기록용 토픽방과 자유 대화용 채팅방(공개/초대) 모두 지원.

## 1. 배경 / 목적

지금은 업무 기록·대화를 JANDI 같은 외부 도구에 의존하고 있다. 이 대시보드 안에서 바로 대화하고, 기록이 남아 나중에 검색으로 찾아볼 수 있으며, 필요할 때 새 토픽이나 채팅방을 직접 만들 수 있게 한다.

## 2. 범위

**포함**
- 토픽방(업무 기록용) + 채팅방(자유 대화용, 공개 또는 초대) — 직원 누구나 생성 가능
- 실시간 메시지 전달(Supabase Realtime) — 카톡처럼 새 메시지가 자동으로 화면에 나타남
- 텍스트 메시지 + 이미지/파일 첨부
- 전체 방 통합 검색(메시지 내용 기준)
- 안읽음 표시(방별 배지)
- 비공개방(초대방) 메시지는 DB 레벨(RLS)에서 멤버가 아니면 절대 조회 불가

**이번 범위 아님**
- 메시지 수정/삭제
- 멘션(@직원), 이모지 반응, 스레드(답글)
- 읽음 확인(누가 읽었는지 표시) — 안읽음 "여부/개수"까지만, 상대방이 읽었는지는 표시 안 함
- 알림(브라우저 푸시, 이메일 등)

## 3. 기술 스택

기존 스택 그대로: Next.js(App Router) + TypeScript, Supabase(Auth + Postgres + **Realtime** — 이 프로젝트에서 Realtime을 쓰는 첫 기능 + **Storage** — 파일 첨부용, 이것도 첫 도입). 공유 `hanyak-ondam` 프로젝트에 테이블 추가.

## 4. 데이터 모델

### `chat_rooms`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | |
| name | text, not null | 방 이름 |
| kind | text, check in ('topic', 'chat') | 토픽방 / 채팅방 구분 |
| is_public | boolean, not null | true면 전체 직원이 별도 초대 없이 접근 가능 |
| created_by | uuid, references staff(id) | |
| created_at | timestamptz, not null, default now() | |

### `chat_room_members`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| room_id | uuid, references chat_rooms(id) on delete cascade | |
| staff_id | uuid, references staff(id) on delete cascade | |
| last_read_at | timestamptz, nullable | 이 방을 마지막으로 읽은 시각(안읽음 배지 계산용) |
| primary key(room_id, staff_id) | | |

**초대방(비공개)**: 방 생성 시 선택한 멤버의 행이 즉시 만들어짐 — 이게 곧 접근 권한이다.
**공개방**: 멤버 행을 미리 만들어두지 않는다. 사용자가 방을 처음 열 때 `last_read_at`을 갱신하면서 행이 생긴다(lazy join) — 접근 권한 자체는 `chat_rooms.is_public = true`로 별도 판단하고, 이 표는 "읽은 시각 기록"으로만 쓰인다.

### `chat_messages`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | |
| room_id | uuid, references chat_rooms(id) on delete cascade | |
| sender_id | uuid, references staff(id) | |
| content | text, nullable | 파일만 보내는 경우 null 허용 |
| created_at | timestamptz, not null, default now() | |

### `chat_attachments`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid, PK | |
| message_id | uuid, references chat_messages(id) on delete cascade | |
| file_url | text, not null | Supabase Storage 공개 URL |
| file_name | text, not null | |
| file_type | text, not null | MIME 타입 |

### Supabase Storage

버킷 `chat-attachments` 하나 생성. 로그인한 직원만 업로드/다운로드 가능(Storage 정책으로 `authenticated` 제한).

## 5. 실시간 처리

방을 열면 `chat_messages`에서 `room_id = 현재방`을 필터로 하는 Realtime 구독을 건다. INSERT 이벤트가 오면 목록에 즉시 추가한다. 방을 나가면(다른 방으로 이동하거나 페이지를 벗어나면) 구독을 해제한다.

## 6. 안읽음 처리

**계산 로직**: 방의 최신 메시지 `created_at`이 내 `last_read_at`(없으면 무한 과거로 취급)보다 늦으면 안읽음. 개수까지 배지로 보여준다.

**조회 방법**: `chat_room_members`를 `LEFT JOIN`해서 공개방인데 아직 한 번도 안 연 방(멤버 행 없음)도 정상적으로 "전체 미읽음"으로 잡히게 하는 Postgres 함수(RPC) `list_rooms_with_unread()`를 만든다 — PostgREST의 기본 쿼리 빌더로는 이 상관 조건(방마다 다른 `last_read_at` 기준)을 표현하기 어렵기 때문.

**갱신**: 방을 열 때 `chat_room_members`에 `(room_id, staff_id, last_read_at = now())`를 upsert.

**테스트**: 안읽음 여부/개수 판정 로직은 (최신 메시지 시각, 내 last_read_at) → (안읽음 여부, 미확인 아님) 형태의 순수 함수로 분리해 Vitest로 검증한다.

## 7. 검색

상단 검색창에 입력하면 `chat_messages.content`에 대해 `ILIKE '%검색어%'`로 전체 방을 통합 검색한다. 결과는 어느 방의 몇 시 메시지인지 보여주고, 클릭하면 해당 방의 그 지점으로 이동한다. 비공개방은 RLS가 자동으로 걸러주므로(멤버가 아니면애초에 그 행이 안 보임) 검색 결과에도 비공개방 메시지가 새지 않는다.

## 8. UI 구조

- 좌측 사이드바에 기존 9개 메뉴 아래 새 섹션 "채팅"을 추가 — **토픽**과 **채팅방**을 구분해서 나열(JANDI와 동일한 2단 구성), 안읽은 방은 굵게 표시 + 개수 배지
- 방 클릭 → 우측 영역에 메시지 목록(위→아래 최신순 스크롤) + 하단 입력창(텍스트 + 파일 첨부 버튼)
- "+" 버튼으로 새 방 만들기: 이름 / 종류(토픽·채팅) / 공개 여부(공개 또는 초대할 직원 선택)
- 사이드바 상단 또는 채팅 영역 상단에 통합 검색창

## 9. 권한 (RLS)

- `chat_rooms`: `authenticated`는 `is_public = true`인 방이거나 자신이 `chat_room_members`에 속한 방만 조회 가능. 생성(insert)은 `authenticated` 누구나.
- `chat_room_members`: 조회는 `is_public = true`인 방의 멤버 행이거나, 자신이 속한 방의 멤버 행만 가능(같은 방 참여자끼리는 서로 볼 수 있어야 멤버 목록 UI가 동작함). Insert는 두 경우만 허용 — **(1)** 자기 자신의 행(`staff_id = auth.uid()`, 공개방을 처음 열 때의 lazy join이나 본인 `last_read_at` 갱신용), **(2)** 그 방을 만든 사람이 초대방 생성 시점에 최초 멤버들의 행을 넣는 경우(`auth.uid()`가 해당 `chat_rooms.created_by`와 같은지 서브쿼리로 확인). 이후 멤버 추가/제거 UI는 범위 밖(§11)이므로 이 두 경로 외의 insert는 막는다.
- `chat_messages`/`chat_attachments`: 해당 방이 공개방이거나, 자신이 그 방의 `chat_room_members`에 있는 경우에만 조회/작성 가능 — 이 조건이 비공개방 메시지를 DB 레벨에서 확실히 막는 핵심 장치.
- Storage 버킷 `chat-attachments`: `authenticated`만 업로드/다운로드.

## 10. 테스트 전략

- 안읽음 판정 순수 함수 — Vitest 단위 테스트
- RLS(비공개방 메시지 차단)와 Realtime 동작은 Phase 1+2/해피콜 때와 동일하게 실제 브라우저로 직접 검증(두 개의 다른 로그인 세션으로 비공개방이 안 보이는지까지 확인)

## 11. 미해결 리스크 / 확인 필요 사항

- 공개방을 나중에 비공개로 바꾸거나, 비공개방에 멤버를 추가/제거하는 관리 UI는 이번 범위에 없다 — 필요해지면 후속 스펙에서 다룬다.
- 검색은 `ILIKE`라 메시지가 수만 건 이상 쌓이면 느려질 수 있다. 지금 팀 규모에서는 문제없다고 보고, 필요해지면 Postgres 전문검색(tsvector)으로 전환한다.
- 파일 첨부 용량 제한(개별 파일 크기, 방/사용자별 누적 용량)은 아직 정하지 않았다 — 구현 계획 단계에서 Supabase Storage 기본 제한을 참고해 합리적인 값을 정한다.
