# 앱 개발 지침 (apps/)

루트 CLAUDE.md는 하네스 전용이다. 앱 작업은 이 파일을 따른다.

## 스택 — docs/adr-0001-stack.md
- `apps/web`: Next.js 16 + React 19 + Tailwind v4 + Supabase. 바뀐 API가 많으니 코드 전에 `apps/web/AGENTS.md`와 `node_modules/next/dist/docs/`를 본다.
  - 미들웨어는 `src/proxy.ts`, `cookies()`·`searchParams`는 비동기.
- 디자인: docs/design-system.md (속초 인디고, D2 벤토 그리드, 글은 짧게, 모서리 낮게).
- AI: docs/ai-features.md (Claude, 영랑이).

## 구조
- `src/lib/domain/` — 순수 규칙(권한·비밀번호·잠금·명단 검사). 테스트는 여기에 둔다.
- `src/lib/server/` — 서버 전용(세션, env, 엑셀, repo). `server-only`.
- `src/lib/server/repo/` — Supabase 키가 없으면 데모(메모리) repo를 쓴다.
- `supabase/migrations/` — 스키마. 모든 테이블 RLS 켜고 정책 없음. 서버가 service role로만 접근.

## 지킬 것 (PRD §12)
- 권한 판정은 `lib/domain/policy.ts`의 `can()` 한 곳에서만. 화면·액션·라우트 모두 `requireCan`.
- API 키·service role 키는 서버에만 (C1). URL에 학번·이름 금지 (C3).
- 감사 로그·확정본은 추가만 (C4). 감사 로그에는 이름 대신 가명ID.
- 첫 비밀번호 변경 전에는 어떤 화면도 못 들어감 (C9).
- LLM은 영랑이만 예외, 가명ID만 보낸다 (ADR-0001).
- 가짜·예시 숫자에는 `SampleTag`("예시")를 붙인다.

## Supabase 연결 (처음 한 번)
1. Supabase 새 프로젝트: 지역 Seoul(ap-northeast-2).
2. SQL Editor에 `apps/web/supabase/migrations/` 의 0001, 0002 를 차례로 붙여 실행. (0002 = service_role 권한. "새 테이블 자동 공개"를 꺼 두었으므로 필요)
3. `apps/web/.env.example` → `.env.local` 로 복사해 채운다 (URL, service role 키, SESSION_SECRET, INITIAL_AUTH_CODE).
4. `npm run seed:admin -- <관리자 이름>` → 첫 관리자 생성. 그 이름 + 인증코드로 로그인하면 비밀번호 변경 화면이 뜬다.
5. `npm run build && npm start` — 화면 위 "데모 모드" 띠가 사라지면 연결된 것.

## 검증
`apps/web`에서: `npx tsc --noEmit` → `npx eslint src` → `npm test` → `npm run build` 모두 통과해야 완료.

## npm (이 네트워크)
`env -u NODE_TLS_REJECT_UNAUTHORIZED NODE_OPTIONS=--use-system-ca npm install …`
