# 디자인 기준 — 허들링(Huddling) 디자인 시스템

> 출처: 사용자 제공 허들링클럽 design md (2026-10-16). 속초고 학업관리 시안의 시각 기준으로 사용한다.
> **모서리·색은 이 문서가 아니라 `docs/design-system.md`(속초 인디고)를 따른다.** 2026-10-16 "너무 둥글다" 피드백으로 알약(9999)·카드 24·입력 16 대신 카드 12 · 블록 10 · 버튼·입력·탭 8 · 태그 6을 쓴다 (Figma 전체 반영).
> 적용 메모 (속초고): 상태색(성공/경고/위험) 없음 · 액센트 블루는 화면당 1~2곳 · 장식용 띠(스트라이프) 금지 · 캐릭터는 화면당 1개.

## Overview

Huddling (허들링) is an AI practice lab and asset library — learning materials, skill/prompt cards, and member-made assets — and its own interface is engineered to get out of the way. The system is strictly monochrome: near-black ink (`{colors.ink}` — #141414) on a pure white canvas (`{colors.canvas}`), with structure carried by a ladder of barely-perceptible neutral tints rather than by shadows or color. The learning content, skill cards, example outputs, and member assets the app exists to show are the only saturated elements on any page — the chrome frames them the way a gallery wall frames paintings.

The geometry does the brand work that color refuses to do. Every interactive element is a stadium pill (`{rounded.full}`): the floating navigation bar, every button, the segmented billing toggle, the overlay badges. Containers sit at a calm `{rounded.md}` (24px), media tiles at `{rounded.sm}` (16px), and app icons render as iOS-style squircles at 30% corner radius. Type is set in Pretendard with strong weight contrast — Bold 700 for every heading, Regular 400 for text, Light 300 for lead subtitles — which gives the monochrome pages a strong typographic voice without a single decorative flourish.

One color is allowed to interrupt: an electric blue accent (`{colors.accent}` — #0066ff), used exclusively for commercial signals — the "Popular" plan badge and the yearly-savings callout on pricing. Its scarcity is the point; when blue appears, it is asking for a decision.

## Colors

| Token | Hex | Use |
|---|---|---|
| ink / primary | #141414 | 텍스트, 모든 주요 CTA 알약, 푸터 |
| ink-soft | #262626 | 보조 진한 텍스트 |
| text-muted | #707070 | 보조 문장, 설명 |
| text-faint | #adadad | 플레이스홀더, 미세 문구 |
| canvas | #ffffff | 페이지·카드 배경 |
| canvas-soft | #f3f3f3 | 강조 면, 세그먼트 트랙, 소프트 알약, FAQ 행 |
| field | #f0f0f0 | 입력칸 채움 (테두리 없음) |
| hairline-soft | #f0f0f0 | 흰 카드 1px 외곽선 |
| hairline | #e0e0e0 | 아웃라인 알약 버튼 테두리 |
| accent | #0066ff | 유일한 유채색 — 결정을 요구하는 1~2곳만, CTA에는 쓰지 않음 |

상태색(성공/경고/오류) 팔레트 없음 — 상태는 무채색 단계로 표현.

## Typography

Pretendard 단독. 700 제목 / 400 본문 / 300 리드 / 600 라벨·버튼. 자간 0, 대문자 변형 없음.

| Token | Size | Weight | Line Height |
|---|---|---|---|
| display | 32 | 700 | 1.3 |
| heading-1 | 28 | 700 | 1.3 |
| heading-2 | 24 | 700 | 1.35 |
| heading-3 | 20 | 700 | 1.35 |
| heading-4 | 18 | 700 | 1.35 |
| title | 17 | 600 | 1.4 |
| body-lg | 17 | 300 | 1.5 |
| body | 15 | 400 | 1.5 |
| body-sm | 13 | 400 | 1.5 |
| link | 15 | 600 | 1.5 |
| label | 12 | 600 | 1.4 |
| caption | 12 | 400 | 1.4 |

## Layout

- 8px 기준, 4px 반 단계. 토큰: 4 · 8 · 12 · 16 · 24 · 32 · 48(section) · 64(section-lg)
- 모바일 기준 프레임 390×844, 최소 360, 좌우 여백 16
- 섹션 구분은 선이 아니라 여백(48~64)
- 버튼: 고정 높이 알약, 좌우 패딩 16 / 입력칸: 패딩 12·16

## Elevation

| Level | 처리 | 용도 |
|---|---|---|
| 0 | canvas 위 평면 | 기본 |
| 1 | canvas-soft 채움, 테두리 없음 | 강조 카드, 소프트 알약, 세그먼트 트랙 |
| 2 | 흰 바탕 + 1px hairline-soft | 일반 카드 |
| 3 | 1px 인셋 링 | 비교 표 강조 열 |
| Inverse | ink 채움 + 흰 글자 | 푸터, 주요 CTA |

그림자 없음. 예외: 세그먼트 컨트롤의 활성 흰 알약만 살짝 띄움.

## Shapes

| Token | Value | Use |
|---|---|---|
| none | 0 | 풀블리드 미디어 |
| sm | 16 | 입력칸, 영상 타일, 후기 카드, FAQ 행 |
| md | 24 | 콘텐츠 카드, 기기 목업, 인물 타일, 푸터 상단 |
| full | 9999 | 모든 알약: 내비, 버튼, 배지, 토글 |

아이콘 타일은 30% 반경 스쿼클. 아바타는 원형.

## Components (요약)

- **button-primary**: ink 채움, 흰 라벨(link), 알약 — 모든 주요 행동
- **button-outline**: 흰 채움, ink 라벨, 1px hairline, 알약 — 보조 행동
- **button-pill-soft**: canvas-soft 채움, ink 라벨, 알약 — 3차 링크
- **card**: 흰 채움 + 1px hairline-soft, 24 / 강조 카드는 canvas-soft 채움, 테두리 없음
- **text-input**: field 채움, 테두리 없음, 16 / 포커스 시 2px ink 링
- **segmented-control**: canvas-soft 알약 트랙 + 활성 흰 알약, 비활성 라벨 muted
- **badge-popular**: accent 채움 + 흰 라벨 알약 — 페이지의 유일한 파랑
- **app-shell-row (사이드바 행)**: 활성 표시는 brand primary(ink)
- **data-table**: 헤더는 캡션 타이포, 본문 body-sm, 행 구분 1px canvas-soft
- **footer**: ink 띠 + 상단 24 라운드

## Do / Don't

Do
- 흰 캔버스 유지, 채도는 콘텐츠(스크린샷·아이콘)만
- 모든 상호작용 요소는 알약
- 강조는 tint 단계(canvas-soft 채움, hairline-soft 외곽선)로
- accent는 화면당 1~2곳
- 제목은 700, 리드 문장은 300으로 대비

Don't
- 그림자 금지
- accent를 CTA에 쓰지 않기 — CTA는 항상 ink 알약
- 추가 액센트 색, UI 그라디언트, 색 섹션 띠 금지
- 강조 카드에 외곽선 쓰지 않기 (canvas-soft 채움으로)
- 자간·대문자 변형 금지
- 입력칸 기본 상태에 테두리 금지
- 작은 크기에서도 알약 모양을 각지게 만들지 않기
