# 하네스 검증과 리뷰 (harness-verification)

> 확정: R8, 2026-10-16
> 기준 문서: `docs/harness-gates.md`, `docs/harness-roles.md`

## 1. 샘플 데이터

실제 학생 데이터는 쓰지 않는다. 가짜 학생 5명으로 만든 `tests/fixtures/sample-run/`을 쓴다.

| ID | 내용 | 기대 결과 |
|---|---|---|
| S001~S003 | 정상 응답 | 통과 |
| S004 | 미응답, `missing.csv` 사유 빈칸 | G4 ③ 실패 |
| S005 | 응답에 5자리 학번 포함 | G1 ③ 실패 |

## 2. 판정자 테스트

- 게이트 조건마다 일부러 틀린 사례 1개 이상 → `judge`가 반드시 FAIL.
- 실패 사례 15개 (G1 4 · G2 4 · G3 3 · G4 4) + 정상 사례 1개 = **16개**
- 실행: `python -m unittest` (표준 라이브러리 + PyYAML만 사용)
- ★ 별도 이름 테스트:
  - `test_N1_unconfirmed_id_in_delivery` — 확정 안 된 ID가 `delivery.csv`에 있으면 FAIL
  - `test_N2_counsel_column_in_input` — `input/`에 상담 열이 있으면 FAIL

## 3. 보호 경로 훅

- `.claude/settings.json`에 PreToolUse 훅 설치.
- 대상: `rules/`, `runs/*/input/`, `runs/*/04_review/decisions.csv`, `runs/*/01_check/missing.csv`
- 확인: 설치 후 `rules/rules.yaml`, `decisions.csv`에 실제 수정을 시도해 차단되는지 본다.

## 4. 리뷰 시점

| 시점 | 누가 | 통과 기준 |
|---|---|---|
| 하네스 생성 직후 | Claude | 테스트 16/16 통과 + 샘플 실행이 S4 대기 상태까지 진행 + 훅 차단 확인 |
| 첫 실전 실행 후 | 교사 | 확정·반려 비율 확인. 반려 30% 초과 시 `rules.yaml` 문체 규칙 재검토 |
| 수시 | 사용자 | `/code-review`로 스크립트 리뷰 |
