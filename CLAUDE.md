# 생기부 초안 하네스 — 오케스트레이터 지침

이 폴더의 루트 CLAUDE.md는 **하네스 전용**이다. 앱 개발 지침은 `apps/CLAUDE.md`에 따로 둔다.

## 하는 일
프로그램 종료 후 가명 처리된 설문 응답으로 학생별 생기부 초안을 만들고,
교사 확정을 거쳐 담임 전달 파일 1개를 만든다.
- 목적·완료 기준: docs/harness-purpose.md
- 서비스 맥락·어기면 안 되는 것(N1, N2): docs/story-service.md

## 파이프라인
S1 수집·점검 → S2 초안 → S3 검사 → S4 교사 확정 → S5 전달 묶음
- 단계·복귀: docs/harness-pipeline.md
- 파일 구조: docs/harness-artifacts.md
- 게이트 G1~G4: docs/harness-gates.md
- 모든 숫자 기준은 rules/rules.yaml 에만 있다. 이 파일에 숫자를 쓰지 않는다.

## 역할 (docs/harness-roles.md)
| 단계 | 담당 | 실행 |
|---|---|---|
| S1 | intake | `python scripts/intake.py runs/<id>` |
| S2 | drafter 서브에이전트 | 학생 1명씩 호출 |
| S3·게이트 | judge | `python scripts/judge.py runs/<id> --gate G1\|G2\|G3\|G4` |
| S4 준비·S5 | packager | `python scripts/packager.py runs/<id> --review\|--deliver` |

## 순서 규칙
1. 시작·재개 시 runs/<id>/run.json 을 먼저 읽는다.
2. 각 단계 후 반드시 judge 를 실행하고 결과를 run.json 에 기록한다.
3. 게이트 미통과 시 다음 단계로 가지 않는다. 복귀는 harness-gates.md 를 따른다.
4. S4에서는 사용자가 "검토 끝났어"라고 할 때까지 멈춰서 기다린다.

## 하지 않는 것
- 초안을 직접 쓰지 않는다. drafter 에게만 맡긴다.
- decisions.csv, missing.csv 사유를 대신 쓰지 않는다.
- rules/ 를 고치지 않는다. 값 변경은 제안만 한다.
- 게이트를 건너뛰거나 판정 결과를 바꾸지 않는다.
- 가명ID↔실명 매핑표를 읽거나 요청하지 않는다.
(보호 경로는 .claude/settings.json 훅으로도 차단된다.)

## 트리거
| 사용자 말 | 동작 |
|---|---|
| "생기부 초안 만들어줘: <프로그램>" | runs/<날짜>_<slug>/ 생성 → input/ 채워달라고 안내 → S1 |
| "이어서 해줘" | run.json 의 멈춘 단계부터 |
| "검토 끝났어" | G3 → 반려 건 S2, 전원 확정이면 S5 |
| "상태 알려줘" | 학생별 단계·실패 사유 표 (수정 없음) |

## 검증
- `python -m unittest` — 16개 전부 통과해야 하네스 수정 완료 (docs/harness-verification.md)
