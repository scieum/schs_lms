# 앱 개발 지침 (apps/)

루트 CLAUDE.md는 하네스 전용이다. 앱 작업은 이 파일을 따른다.

## 스택 — docs/adr-0001-stack.md
- `apps/web`: Next.js 16 + React 19 + Tailwind v4 + Supabase. 바뀐 API가 많으니 코드 전에 `apps/web/AGENTS.md`와 `node_modules/next/dist/docs/`를 본다.
  - 미들웨어는 `src/proxy.ts`, `cookies()`·`searchParams`는 비동기.
- 디자인: docs/design-system.md (속초 인디고, D2 벤토 그리드, 글은 짧게, 모서리 낮게).
- AI: docs/ai-features.md (Claude, 영랑이).

## 구조
- `apps/neis-extension/` — 나이스 입력 도우미(크롬 확장, MV3). 앱 `/teacher/neis`에서 복사한 확정 세특·창체·행발을 열린 나이스 화면에 한 번에 채우거나 한 명씩 넣는다. 저장은 교사가 직접. 고친 뒤 `apps/web`에서 `npm run pack:neis`로 `public/neis-helper.zip`을 다시 만든다. README 참고.
- `src/lib/domain/` — 순수 규칙(권한·비밀번호·잠금·명단 검사). 테스트는 여기에 둔다.
- `src/lib/server/` — 서버 전용(세션, env, 엑셀, repo). `server-only`.
- `src/lib/server/repo/` — Supabase 키가 없으면 데모(메모리) repo를 쓴다. 기능별 모듈은 `repo/modules/*.ts`(인터페이스 + 데모 + Supabase 구현), `index.ts`가 합친다.
- `src/lib/server/ai/` — Claude 호출은 `claude.ts`(aiJson) 하나로. 생기부 문장 프롬프트는 `record-prompts.ts`(속초고 세특 프롬프트 노션), 문체 검사는 `lib/domain/neis-style.ts`.
- `supabase/migrations/` — 스키마. 모든 테이블 RLS 켜고 정책 없음. 서버가 service role로만 접근.

## 작업 순서 (2026-10-17 사용자 지시)
1. 기능·화면 요청이 오면 **먼저 Figma 시안**(파일 `VTHccW9TvWVWbNwdBawvSI`)을 고치거나 새로 그린다.
2. 시안 스크린샷으로 확인한다 (겹침·잘림·문구, PC·모바일 둘 다).
3. 그다음 코드 개발 → 아래 검증 → 커밋·푸시.
4. 개발하다 시안과 달라지면 시안도 다시 맞춘다. 새 시안 번호는 `docs/design-system.md` 에 적는다.

## 지킬 것 (PRD §12)
- 권한 판정은 `lib/domain/policy.ts`의 `can()` 한 곳에서만. 화면·액션·라우트 모두 `requireCan`.
- API 키·service role 키는 서버에만 (C1). URL에 학번·이름 금지 (C3).
- 감사 로그·확정본은 추가만 (C4). 감사 로그에는 이름 대신 가명ID.
- 첫 비밀번호 변경 전에는 어떤 화면도 못 들어감 (C9).
- AI는 버튼으로만, 가명ID만 보내고 확인 후 반영 (ADR-0001 C2). 원본 이미지를 읽는 예외 3가지는 ADR에 적혀 있다.
- 가짜·예시 숫자에는 `SampleTag`("예시")를 붙인다.

## Supabase 연결 (처음 한 번)
1. Supabase 새 프로젝트: 지역 Seoul(ap-northeast-2).
2. SQL Editor에 `apps/web/supabase/migrations/` 의 0001 ~ 0017 을 번호 순서대로 붙여 실행. (0002 = service_role 권한. "새 테이블 자동 공개"를 꺼 두었으므로 필요)
3. `apps/web/.env.example` → `.env.local` 로 복사해 채운다 (URL, service role 키, SESSION_SECRET, INITIAL_AUTH_CODE).
4. 첫 관리자: `/signup` (교사 가입, 학교 인증코드 필요)에서 **맨 처음 가입한 교사가 관리자**가 된다. 또는 `npm run seed:admin -- <관리자 이름>`.
5. `npm run build && npm start` — 화면 위 "데모 모드" 띠가 사라지면 연결된 것.

## 검증
`apps/web`에서: `npx tsc --noEmit` → `npx eslint src` → `npm test` → `npm run build` 모두 통과해야 완료.

## npm (이 네트워크)
`env -u NODE_TLS_REJECT_UNAUTHORIZED NODE_OPTIONS=--use-system-ca npm install …`
