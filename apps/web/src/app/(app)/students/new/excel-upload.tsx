"use client";
import { startTransition, useActionState, useEffect, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { Avatar, Button, ButtonLink, Card, Row, Tag } from "@/components/ui";
import { ExcelButtons, TemplateSheet } from "@/components/excel-buttons";
import { previewRoster, registerRoster, type PreviewState } from "../actions";

// 학생 등록 · 엑셀로 여러 명 (Figma N25 342:8001 · 모바일 오류 342:8392):
// 카드 "명단 파일"(버튼 줄 + 양식 그림) | 오른쪽 "등록 요약". 학생등록_양식.xlsx 만 읽는다 (AI·열 맞추기 없음).

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

  useEffect(() => {
    setReady(p && !done && !registering ? p.summary.ok : 0);
    return () => setReady(0);
  }, [p, done, registering]);

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
            <div className="max-h-[520px] overflow-y-auto">
              {p.rows.map((r, i) => (
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
                  right={<Tag>{STATUS_LABEL[r.status]}</Tag>}
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
            {[["새 학생", p?.summary.ok], ["중복 (건너뜀)", p?.summary.duplicate], ["확인 필요", p?.summary.invalid]].map(([k, v]) => (
              <div key={k} className="flex"><dt className="flex-1 text-sub">{k}</dt><dd className={v === undefined ? "text-faint" : "font-medium"}>{v === undefined ? "—" : `${v}명`}</dd></div>
            ))}
          </dl>
          <form id={REGISTER_FORM} action={registerAction} className="mt-4">
            <input type="hidden" name="rows" value={JSON.stringify(p ? p.rows.filter((r) => r.status === "new").map((r) => r.input.raw) : [])} />
            <Button className="w-full disabled:bg-key disabled:opacity-40" disabled={!p || registering || p.summary.ok === 0}>
              {registering ? "등록하는 중…" : p && p.summary.ok ? `${p.summary.ok}명 등록하기` : "등록하기"}
            </Button>
          </form>
          {result.kind === "error" && <p className="mt-3 text-sm text-bad" role="alert">{result.message}</p>}
          {p && p.summary.invalid > 0 && <p className="mt-3 text-[13px] text-mute">확인 필요 행은 양식에서 고쳐 다시 올리면 돼요</p>}
        </section>
      )}
    </div>
  );
}
