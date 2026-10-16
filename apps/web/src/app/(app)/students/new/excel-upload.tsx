"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { AiBanner, Avatar, Button, ButtonLink, Card, Row, Steps, Tag, cx } from "@/components/ui";
import { FIELD_LABEL, type Field } from "@/lib/domain/roster";
import { previewRoster, registerRoster, type PreviewState } from "../actions";

const STATUS_LABEL = { new: "새로 추가", duplicate: "중복", invalid: "확인 필요" } as const;

export function ExcelUpload() {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(previewRoster, { kind: "idle" });
  const [result, registerAction, registering] = useActionState<PreviewState, FormData>(registerRoster, { kind: "idle" });
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // 폼이 초기화돼도 열 맞춤을 다시 보낼 수 있게 고른 파일을 따로 들고 있는다
  const picked = useRef<File | null>(null);
  const mapping = preview.kind === "mapping" ? preview : null;
  const applyMap = (map: Partial<Record<Field, number>>) => {
    if (!picked.current) return;
    const fd = new FormData();
    fd.set("file", picked.current);
    fd.set("map", JSON.stringify(map));
    startTransition(() => previewAction(fd));
  };

  const done = result.kind === "done" ? result : null;
  const p = preview.kind === "preview" ? preview : null;
  const step = done ? 3 : p ? 2 : fileName ? 1 : 0;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Steps items={["양식 받기", "파일 올리기", "확인", "등록"]} active={step} />

      {p && p.renamed.length > 0 && (
        <AiBanner
          label="자동"
          title="열 맞추기"
          line={`양식과 다른 열 이름 ${p.renamed.length}개를 맞췄어요 · ${p.renamed.map((r) => `${r.from}→${r.to}`).join(", ")}`}
        />
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
        <div className="flex flex-col gap-4 md:gap-6">
          <Card className={p ? undefined : "flex-1"}>
            <form action={previewAction} className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-field bg-key-soft text-key-strong">
                <Upload size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium">{fileName || "채운 양식을 올려 주세요"}</div>
                <div className="text-[13px] text-mute">{p ? `${p.summary.total}명 읽음` : "xlsx · 2MB까지"}</div>
              </div>
              <input
                ref={fileRef}
                type="file"
                name="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  picked.current = e.target.files?.[0] ?? null;
                  setFileName(e.target.files?.[0]?.name ?? "");
                  e.currentTarget.form?.requestSubmit();
                }}
              />
              <Button type="button" kind="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={previewing}>
                {previewing ? "읽는 중…" : fileName ? "다시 올리기" : "파일 고르기"}
              </Button>
            </form>
            {preview.kind === "error" && <p className="mt-3 text-sm text-bad" role="alert">{preview.message}</p>}
          </Card>

          {mapping && (
            <ColumnMapper key={`${mapping.fileName}-${JSON.stringify(mapping.map)}`} state={mapping} busy={previewing} onApply={applyMap} />
          )}

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

        <div className="flex flex-col gap-4 md:gap-6">
          <Card title="등록 양식" className={p || done ? undefined : "flex-1"}>
            <Row
              last
              lead={<span className="flex size-10 shrink-0 items-center justify-center rounded-field bg-white"><FileSpreadsheet size={20} /></span>}
              title="학생등록_양식.xlsx"
              meta="학년 · 반 · 번호 · 이름 · 성별 · 계열(비우면 1)"
              right={<ButtonLink href="/students/template" kind="soft" size="sm" prefetch={false}>받기</ButtonLink>}
            />
          </Card>

          {done ? (
            <Card title="등록 완료">
              <p className="text-[15px]"><strong>{done.count}명</strong>을 등록했어요.</p>
              <p className="mt-1 text-[13px] text-mute">가명ID {done.firstId}–{done.lastId} · 첫 비밀번호는 공통 인증코드예요</p>
              <ButtonLink href="/students" kind="outline" className="mt-4 w-full">학생 목록 보기</ButtonLink>
            </Card>
          ) : (
            p && (
              <Card title="등록 요약">
                <dl className="flex flex-col gap-2.5 text-sm">
                  {[["새 학생", `${p.summary.ok}명`], ["중복 (건너뜀)", `${p.summary.duplicate}명`], ["확인 필요", `${p.summary.invalid}명`]].map(([k, v]) => (
                    <div key={k} className="flex"><dt className="flex-1 text-mute">{k}</dt><dd className="font-medium">{v}</dd></div>
                  ))}
                </dl>
                <form action={registerAction} className="mt-4">
                  <input
                    type="hidden"
                    name="rows"
                    value={JSON.stringify(p.rows.filter((r) => r.status === "new").map((r) => r.input.raw))}
                  />
                  <Button className="w-full" disabled={registering || p.summary.ok === 0}>
                    {registering ? "등록하는 중…" : `${p.summary.ok}명 등록하기`}
                  </Button>
                </form>
                {result.kind === "error" && <p className="mt-3 text-sm text-bad" role="alert">{result.message}</p>}
                {p.summary.invalid > 0 && <p className="mt-3 text-[13px] text-mute">확인 필요 행은 고쳐서 다시 올리면 돼요</p>}
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const FIELDS: Field[] = ["grade", "classNo", "number", "name", "gender", "track"];
const REQUIRED: Field[] = ["grade", "classNo", "number", "name", "gender"];

/** 양식과 다른 열 이름 → 열 맞추기 제안(AI는 1행 제목만 봄) → 교사가 고친 뒤 "확인 후 적용" */
function ColumnMapper({ state, busy, onApply }: {
  state: Extract<PreviewState, { kind: "mapping" }>;
  busy: boolean;
  onApply: (map: Partial<Record<Field, number>>) => void;
}) {
  const [map, setMap] = useState<Partial<Record<Field, number>>>(state.map);
  const missing = REQUIRED.filter((f) => map[f] === undefined);
  const set = (f: Field, v: string) => setMap((m) => {
    const next = { ...m };
    if (v === "") delete next[f];
    else {
      const idx = Number(v);
      for (const k of FIELDS) if (next[k] === idx) delete next[k]; // 한 열은 한 항목에만
      next[f] = idx;
    }
    return next;
  });

  return (
    <Card title="열 맞추기" action={<Tag tone={state.label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong"}>{state.label}</Tag>}>
      <p className="mb-3 text-[13px] text-sub">양식과 열 이름이 달라요. 맞춘 열을 확인해 주세요 · AI에는 1행 제목만 보내요</p>
      {state.notice && <p className="mb-3 text-[12px] text-mute">{state.notice}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-sub">{FIELD_LABEL[f]}{f === "track" ? " (비우면 1)" : ""}</span>
            <select value={map[f] ?? ""} onChange={(e) => set(f, e.target.value)}
              className={cx("h-10 rounded-field bg-white px-3 text-[14px] outline-none focus:ring-2 focus:ring-key", map[f] === undefined && f !== "track" && "ring-2 ring-wait")}>
              <option value="">없음</option>
              {state.headers.map((h, i) => <option key={i} value={i}>{h || `${i + 1}번째 열`}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        {missing.length > 0 && <span className="flex-1 text-[13px] text-wait">{missing.map((f) => FIELD_LABEL[f]).join(", ")} 열을 골라 주세요</span>}
        <Button type="button" kind="outline" size="sm" disabled={busy || missing.length > 0} onClick={() => onApply(map)}>
          {busy ? "읽는 중…" : "확인 후 적용"}
        </Button>
      </div>
    </Card>
  );
}
