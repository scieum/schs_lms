"use client";
import { startTransition, useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { Avatar, Button, ButtonLink, Card, Row, Tag, cx } from "@/components/ui";
import type { CheckedRow, Gender } from "@/lib/domain/roster";
import { ExcelButtons, TemplateSheet } from "@/components/excel-buttons";
import { previewRoster, registerRoster, type PreviewState } from "../actions";

// 학생 등록 · 엑셀로 여러 명 (Figma N25 342:8001 · 모바일 오류 342:8392):
// 카드 "명단 파일"(버튼 줄 + 양식 그림) | 오른쪽 "등록 요약". 학생등록_양식.xlsx 와 학교 명렬표(학생명렬표 xlsx · csv)를 읽는다 (AI·열 맞추기 없음).
// 명렬표 · 학번 · 이름 명단은 성별 칸이 없어 "모두 남 · 모두 여" 또는 학생마다 눌러 고른다 — 성별만 빈 줄은 고르면 새로 추가가 된다.

const STATUS_LABEL = { new: "새로 추가", duplicate: "중복", invalid: "확인 필요" } as const;
const REGISTER_FORM = "register-roster";

// 머리의 "등록하기"(서버 화면 머리에 있음)가 이 화면의 미리보기 상태를 알도록 작은 저장소를 둔다
let readyCount = 0;
const listeners = new Set<() => void>();
function setReady(n: number) {
  if (readyCount === n) return;
  readyCount = n;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 머리 "등록하기": 새 학생이 있을 때만 켜진다 (올리기 전에는 흐리게) */
export function RegisterHeaderButton() {
  const n = useSyncExternalStore(subscribe, () => readyCount, () => 0);
  return (
    <Button form={REGISTER_FORM} size="sm" disabled={n === 0} className="hidden disabled:bg-key disabled:opacity-40 md:inline-flex">
      <Check size={14} /> 등록하기
    </Button>
  );
}

const GRAY = "flex flex-col rounded-card bg-soft p-5 md:p-6";

export function ExcelUpload() {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewRoster, { kind: "idle" });
  const [result, registerAction, registering] = useActionState<PreviewState, FormData>(
    async (prev, form) => (form.get("reset") ? { kind: "idle" } : registerRoster(prev, form)),
    { kind: "idle" },
  );

  const done = result.kind === "done" ? result : null;
  const p = preview.kind === "preview" ? preview : null;
  const failed = preview.kind === "error" ? preview : null;

  // 명렬표 성별 (파일이 바뀌면 처음부터)
  const fileKey = p ? `${p.fileName}|${p.summary.total}` : "";
  const [pickG, setPickG] = useState<{ key: string; all: Gender | ""; per: Record<number, Gender> }>({ key: "", all: "", per: {} });
  const g = pickG.key === fileKey ? pickG : { key: fileKey, all: "" as const, per: {} };
  const onlyGender = (r: CheckedRow) => r.status === "invalid" && r.problems.length === 1 && r.problems[0] === "성별이 비어 있어요";
  const rows: CheckedRow[] = !p ? [] : !p.myeongnyeol ? p.rows : p.rows.map((r) => {
    const gender = g.per[r.line] ?? g.all;
    return onlyGender(r) && gender ? { ...r, status: "new" as const, problems: [], input: { ...r.input, gender, raw: { ...r.input.raw, gender } } } : r;
  });
  const need = p?.myeongnyeol ? p.rows.filter(onlyGender) : [];
  const summary = p ? { ...p.summary, ok: rows.filter((r) => r.status === "new").length, invalid: rows.filter((r) => r.status === "invalid").length } : null;
  const setAll = (all: Gender) => setPickG({ key: fileKey, all, per: {} });
  const flip = (line: number) => setPickG({ ...g, per: { ...g.per, [line]: (g.per[line] ?? g.all) === "남" ? "여" : "남" } });

  const okCount = summary?.ok ?? 0;
  useEffect(() => {
    setReady(!done && !registering ? okCount : 0);
    return () => setReady(0);
  }, [okCount, done, registering]);

  const pick = (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    startTransition(() => {
      if (result.kind !== "idle") {
        const reset = new FormData();
        reset.set("reset", "1");
        registerAction(reset);
      }
      previewAction(fd);
    });
  };

  const fileRow = failed?.fileName
    ? { name: failed.fileName, tag: "읽지 못함", failed: true }
    : p ? { name: p.fileName, tag: `${p.summary.total}명 읽음` } : null;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6">
      <div className="flex min-w-0 flex-col gap-4 md:gap-6">
        <section className={GRAY}>
          <h2 className="mb-4 text-[17px] font-bold md:text-lg">명단 파일</h2>
          <ExcelButtons kind="register" onPick={pick} busy={previewing} error={failed?.message} file={fileRow} />
          <div className="mb-2 mt-4 text-[13px] font-medium text-sub">양식</div>
          <TemplateSheet kind="register" />
        </section>

        {p && (
          <Card title="확인할 학생" action={<span className="text-[13px] text-sub">{p.summary.total}명</span>}>
            {p.myeongnyeol && need.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-inner bg-key-soft px-3.5 py-2.5">
                <span className="min-w-0 flex-1 text-[13px] font-medium text-key-strong">{p.myeongnyeol.label} · 성별 칸이 없어요 — 고른 뒤 학생을 누르면 바뀌어요</span>
                {(["남", "여"] as const).map((x) => (
                  <button key={x} type="button" onClick={() => setAll(x)} aria-pressed={g.all === x}
                    className={cx("h-8 rounded-control px-3 text-[13px] font-bold", g.all === x ? "bg-key text-white" : "bg-[#fff] text-key-strong")}>모두 {x}</button>
                ))}
              </div>
            )}
            <div className="max-h-[520px] overflow-y-auto">
              {rows.map((r, i) => (
                <Row
                  key={r.line}
                  last={i === p.rows.length - 1}
                  lead={<Avatar name={r.input.name || "?"} />}
                  title={r.input.name || `${r.line}행`}
                  meta={
                    r.status === "new"
                      ? `${r.input.grade}학년 ${r.input.classNo}반 ${r.input.number}번 · ${r.input.gender} · ${r.input.track}계열`
                      : `${r.line}행 · ${r.problems.join(" · ")}`
                  }
                  right={p.myeongnyeol && (onlyGender(r) || need.some((x) => x.line === r.line)) && (g.per[r.line] ?? g.all)
                    ? <button type="button" onClick={() => flip(r.line)} className="rounded-chip bg-soft px-2 py-1 text-[12px] font-bold text-sub" aria-label={`${r.input.name} 성별 바꾸기`}>{g.per[r.line] ?? g.all} ⇄</button>
                    : <Tag>{STATUS_LABEL[r.status]}</Tag>}
                />
              ))}
            </div>
          </Card>
        )}
      </div>

      {done ? (
        <section className={`${GRAY} md:self-start`}>
          <h2 className="mb-4 text-[17px] font-bold md:text-lg">등록 완료</h2>
          <p className="text-[15px]"><strong>{done.count}명</strong>을 등록했어요.</p>
          <p className="mt-1 text-[13px] text-mute">가명ID {done.firstId}–{done.lastId} · 첫 비밀번호는 공통 인증코드예요</p>
          <ButtonLink href="/students" kind="outline" className="mt-4 w-full">학생 목록 보기</ButtonLink>
        </section>
      ) : (
        <section className={p ? `${GRAY} md:self-start` : GRAY}>
          <h2 className="mb-4 text-[17px] font-bold md:text-lg">등록 요약</h2>
          <dl className="flex flex-col gap-2.5 text-sm">
            {[["새 학생", summary?.ok], ["중복 (건너뜀)", summary?.duplicate], ["확인 필요", summary?.invalid]].map(([k, v]) => (
              <div key={k} className="flex"><dt className="flex-1 text-sub">{k}</dt><dd className={v === undefined ? "text-faint" : "font-medium"}>{v === undefined ? "—" : `${v}명`}</dd></div>
            ))}
          </dl>
          <form id={REGISTER_FORM} action={registerAction} className="mt-4">
            <input type="hidden" name="rows" value={JSON.stringify(rows.filter((r) => r.status === "new").map((r) => r.input.raw))} />
            <Button className="w-full disabled:bg-key disabled:opacity-40" disabled={!summary || registering || summary.ok === 0}>
              {registering ? "등록하는 중…" : summary && summary.ok ? `${summary.ok}명 등록하기` : "등록하기"}
            </Button>
          </form>
          {result.kind === "error" && <p className="mt-3 text-sm text-bad" role="alert">{result.message}</p>}
          {summary && summary.invalid > 0 && <p className="mt-3 text-[13px] text-mute">{need.length && !g.all ? "명렬표는 위에서 성별을 골라 주세요" : "확인 필요 행은 양식에서 고쳐 다시 올리면 돼요"}</p>}
        </section>
      )}
    </div>
  );
}
