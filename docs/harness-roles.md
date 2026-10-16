# 하네스 역할 (harness-roles)

> 확정: R6, 2026-10-16
> 기준 문서: `docs/harness-pipeline.md`, `docs/harness-artifacts.md`, `docs/harness-gates.md`

## 역할과 편집 범위

LLM 에이전트는 `drafter` 1개만 둔다. 판단이 필요 없는 단계는 스크립트로 처리한다.

| 역할 | 종류 | 편집 가능 경로 | 단계 |
|---|---|---|---|
| `drafter` | 서브에이전트 (`.claude/agents/drafter.md`) | `runs/<id>/02_drafts/` | S2 |
| `judge` | 스크립트 `scripts/judge.py` — 읽기전용 판정자, LLM 미사용 | `runs/<id>/03_verdicts/` (판정 결과만) | S3 · G1~G4 |
| `intake` | 스크립트 `scripts/intake.py` | `runs/<id>/01_check/` | S1 |
| `packager` | 스크립트 `scripts/packager.py` | `runs/<id>/04_review/review.md`, `runs/<id>/05_delivery/` | S4 준비 · S5 |
| 오케스트레이터 | 메인 Claude (`CLAUDE.md`) | `runs/<id>/run.json` | 전체 순서 |

- `judge`는 초안을 읽기만 하고 고치지 않는다. 같은 입력이면 항상 같은 결과를 낸다.

## 사람만 쓰는 경로 (에이전트 편집 금지)

| 경로 | 쓰는 사람 |
|---|---|
| `rules/` | 사용자 |
| `runs/<id>/input/` | 프로그램 담당 교사 |
| `runs/<id>/04_review/decisions.csv` | 프로그램 담당 교사 |
| `runs/<id>/01_check/missing.csv`의 사유 열 | 프로그램 담당 교사 |

차단 방법: PreToolUse 훅으로 위 경로에 대한 Edit/Write를 막는다 (설치는 R8).
`missing.csv`는 `intake`가 사유 칸을 비운 채로 처음 한 번만 만들고, 그 뒤로는 사람만 고친다.

## 자연어 트리거

| 이렇게 말하면 | 동작 |
|---|---|
| "생기부 초안 만들어줘: `<프로그램>`" | 새 `runs/` 폴더 생성 → S1부터 |
| "이어서 해줘" | `run.json`을 읽고 멈춘 단계부터 |
| "검토 끝났어" | G3 확인 → 반려 건은 S2, 전원 확정이면 S5 |
| "상태 알려줘" | 학생별 단계·실패 사유 표 출력 (아무것도 고치지 않음) |
