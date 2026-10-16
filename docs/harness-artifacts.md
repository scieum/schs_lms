# 하네스 산출물 (harness-artifacts)

> 확정: R4, 2026-10-16
> 기준 문서: `docs/harness-pipeline.md`

## 실행 폴더 구조

실행 1회 = 폴더 1개: `runs/<YYYY-MM-DD>_<프로그램-slug>/`

```
runs/2026-10-16_career-day/
├── run.json                  # 진행 상태 (재개용)
├── input/
│   ├── program.json          # 이름, 분류, 개요
│   ├── roster.csv            # 가명ID, 희망진로
│   └── responses.csv         # 가명ID, 4문항 답
├── 01_check/
│   ├── check.csv             # 가명ID, 응답여부
│   └── missing.csv           # 가명ID, 사유 (교사 기입)
├── 02_drafts/S001.md …       # 학생별 초안
├── 03_verdicts/S001.json …   # 통과/실패, 사유, 시도 횟수
├── 04_review/
│   ├── review.md             # 교사에게 보여줄 전원 묶음
│   └── decisions.csv         # 가명ID, 확정/반려, 반려 사유
└── 05_delivery/delivery.csv  # 담임 전달 파일 (1개)
```

## 단계별 산출물

| 단계 | 쓰는 파일 | 읽는 파일 |
|---|---|---|
| S1 | `01_check/check.csv`, `01_check/missing.csv` | `input/*` |
| S2 | `02_drafts/<ID>.md` | `input/*`, `01_check/check.csv`, `rules/rules.yaml`, (재시도 시) `03_verdicts/<ID>.json`, `04_review/decisions.csv` |
| S3 | `03_verdicts/<ID>.json` | `02_drafts/<ID>.md`, `rules/rules.yaml` |
| S4 | `04_review/review.md` (생성), `04_review/decisions.csv` (교사 기입) | `02_drafts/*`, `03_verdicts/*` |
| S5 | `05_delivery/delivery.csv` | `02_drafts/*`, `04_review/decisions.csv`, `01_check/missing.csv` |

## 규칙 SSOT

`rules/rules.yaml` 1개. 모든 에이전트와 판정 스크립트는 규칙을 이 파일에서만 읽는다.

담을 항목 (값은 R5에서 확정):
- 분류별 글자수 한도 (세특 500자, 나머지 OI-5 확정 전까지 임시 500자)
- 금지 패턴 (학번 패턴, 가명 ID, 명부 실명)
- 문체 규칙
- 공통 설문 4문항 이름

## 재개

- `run.json`에 학생별 현재 단계와 시도 횟수를 기록한다.
- 재실행 시 S3를 통과한 학생은 건너뛴다.
- S4는 `decisions.csv`가 채워질 때까지 대기 상태로 멈춘다.

## 담임 전달 파일

- `05_delivery/delivery.csv` 1개, UTF-8 BOM.
- 열: 가명ID / 분류 / 확정 문장 / 글자수
- 하네스 안에서는 가명을 유지한다. 실명 복원은 하네스 밖에서 교사가 매핑표로 한다. 하네스는 매핑표를 읽지 않는다.
