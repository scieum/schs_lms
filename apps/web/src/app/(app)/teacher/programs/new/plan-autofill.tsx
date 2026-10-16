"use client";
import { useRef, useState, useTransition } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { AREA_LABEL, md, SOURCE_LABEL } from "@/lib/domain/program";
import { checkPlanFile, classesLabel, PLAN_MAX_FILES, type PlanFields, type PlanKey } from "@/lib/domain/program-plan";
import { readPlanAction, type PlanState } from "./actions";

/** 폼에 채울 단위 (기간은 시작·끝을 한 줄로) */
export type FillKey = "title" | "area" | "subject" | "period" | "overview" | "targets" | "extras" | "docKinds" | "source";
export type FormNow = Record<FillKey, { dirty: boolean; text: string }>;

const ROWS: [FillKey, string, PlanKey][] = [
  ["title", "프로그램 이름", "title"],
  ["area", "기록 영역", "area"],
  ["subject", "담당 교과", "subject"],
  ["period", "활동 기간", "startDate"],
  ["overview", "활동 개요", "overview"],
  ["targets", "대상 반", "targetClasses"],
  ["extras", "추가 문항", "extraQuestions"],
  ["docKinds", "받을 서류", "docKinds"],
  ["source", "근거 자료", "source"],
];

function show(k: FillKey, f: PlanFields): string | null {
  switch (k) {
    case "title": return f.title;
    case "area": return f.area ? AREA_LABEL[f.area] : null;
    case "subject": return f.subject;
    case "period": return f.startDate ? (f.endDate && f.endDate !== f.startDate ? `${md(f.startDate)} – ${md(f.endDate)}` : md(f.startDate)) : null;
    case "overview": return f.overview;
    case "targets": return f.targetClasses.length ? `${classesLabel(f.targetClasses)}${f.targetText ? ` ("${f.targetText}")` : ""}` : f.targetText ? `"${f.targetText}" — 학교 반과 맞지 않아요` : null;
    case "extras": return f.extraQuestions.length ? f.extraQuestions.join(" / ") : null;
    case "docKinds": return f.docKinds.length ? f.docKinds.join(", ") : null;
    case "source": return f.source ? SOURCE_LABEL[f.source] : null;
  }
}

/** 큰 캡처 이미지는 보내기 전에 줄인다 (긴 변 2000px, JPEG) */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1_200_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

// T3 맨 위: 계획서·기안문(PDF·캡처)을 읽어 등록 칸을 채운다. 읽은 내용 확인 → "확인 후 채우기" → 폼 상태만 바뀐다 (등록은 교사가)
export function PlanAutofill({ aiOn, now, onApply }: { aiOn: boolean; now: FormNow; onApply: (keys: FillKey[], f: PlanFields) => void }) {
  const [state, setState] = useState<PlanState>({});
  const [reading, startReading] = useTransition();
  const [files, setFiles] = useState<File[]>([]);
  const [warn, setWarn] = useState<string | null>(null);
  const [off, setOff] = useState<{ n: number; keys: FillKey[] }>({ n: -1, keys: [] });
  const [closed, setClosed] = useState(-1);
  const input = useRef<HTMLInputElement>(null);

  const add = async (list: File[]) => {
    const bad = list.map((f) => checkPlanFile(f)).find(Boolean);
    setWarn(bad ?? null);
    const ok = await Promise.all(list.filter((f) => !checkPlanFile(f)).map(shrink));
    setFiles((cur) => [...cur, ...ok].slice(0, PLAN_MAX_FILES));
  };
  const read = () => {
    if (!files.length) return input.current?.click();
    const fd = new FormData();
    files.forEach((f) => fd.append("plan", f));
    startReading(async () => {
      try {
        const next = await readPlanAction(state, fd);
        setState(next);
      } catch {
        // 서버 업로드 한도를 넘으면 액션 자체가 실패한다 → 화면이 깨지지 않게 짧게 알린다
        setState({ error: "파일이 너무 커서 보내지 못했어요. 쪽을 줄이거나 캡처로 올려 주세요", n: (state.n ?? 0) + 1 });
      }
    });
  };

  const n = state.n ?? 0;
  const f = state.read?.fields;
  const rows = f ? ROWS.map(([k, label, pk]) => ({ k, label, value: show(k, f), from: state.read!.from[pk] ?? null, now: now[k] })).filter((r) => r.value && !(r.k === "targets" && !f.targetClasses.length)) : [];
  // 처음 상태: 비어 있는 칸은 채우기, 이미 입력한 칸은 체크 해제(덮어쓰기는 교사가 고름)
  const unchecked = off.n === n ? off.keys : rows.filter((r) => r.now.dirty && r.now.text !== r.value).map((r) => r.k);
  const toggle = (k: FillKey) => setOff({ n, keys: unchecked.includes(k) ? unchecked.filter((x) => x !== k) : [...unchecked, k] });
  const open = !!f && closed !== n;
  const label = state.label ?? (aiOn ? "AI" : "자동");

  return (
    <div
      className="rounded-inner bg-soft px-4 py-3.5 md:px-5 md:py-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); void add([...e.dataTransfer.files]); }}
      onPaste={(e) => { const list = [...e.clipboardData.files]; if (list.length) { e.preventDefault(); void add(list); } }}
    >
      <div className="flex items-center gap-3 md:gap-4">
        <span className={cx("rounded-chip px-2.5 py-1 text-xs font-bold", label === "AI" ? "bg-new-soft text-new" : "bg-key-soft text-key-strong")}>{label}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">계획서·기안문으로 채우기</div>
          <div className="truncate text-[13px] text-sub">
            {reading ? "읽는 중이에요" : aiOn ? "PDF·HWPX·캡처를 올리면 이름·기간·대상을 읽어 채워요" : "AI가 꺼져 있어 파일 이름·문서 정보로만 채워요"}
          </div>
        </div>
        <input ref={input} type="file" multiple accept=".pdf,image/png,image/jpeg,image/webp,.hwp,.hwpx" className="sr-only" aria-label="계획서 파일"
          onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <Button type="button" kind="outline" size="sm" onClick={read} disabled={reading}>
          {reading ? "읽는 중…" : files.length ? "읽기" : <><Upload size={14} /> 파일 올리기</>}
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {files.map((x, i) => (
          <span key={`${x.name}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-chip bg-white py-1 pl-2.5 pr-1.5 text-[12px]">
            <FileText size={12} className="shrink-0 text-mute" /> <span className="truncate">{x.name}</span>
            <button type="button" aria-label="빼기" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-mute"><X size={12} /></button>
          </span>
        ))}
        {files.length > 0 && files.length < PLAN_MAX_FILES && (
          <button type="button" onClick={() => input.current?.click()} className="rounded-chip px-2 py-1 text-[12px] font-medium text-sub hover:bg-white">+ 더 올리기</button>
        )}
        <span className="text-[12px] text-mute">
          {files.length ? "" : "끌어다 놓거나 캡처를 붙여넣어도(Ctrl+V) 돼요 · "}PDF·HWPX·JPG·PNG 10MB 이하 · HWP는 한글에서 HWPX로 저장해 올려 주세요
        </span>
      </div>
      {(warn || state.error) && <p className="mt-2 text-[13px] text-bad" role="alert">{warn ?? `${state.error}${state.note ? ` · ${state.note}` : ""}`}</p>}
      {!state.error && state.note && f && <p className="mt-2 text-[13px] text-wait">{state.note}</p>}

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-bold">읽은 내용</span>
            <span className="text-mute">{state.files?.join(", ")}</span>
          </div>
          {rows.length === 0 ? (
            <p className="rounded-inner bg-white px-4 py-3 text-[13px] text-mute">채울 수 있는 내용을 찾지 못했어요. 직접 입력해 주세요</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rows.map((r) => {
                const on = !unchecked.includes(r.k);
                return (
                  <li key={r.k}>
                    <label className={cx("flex cursor-pointer items-start gap-3 rounded-inner bg-white px-4 py-2.5", !on && "opacity-60")}>
                      <input type="checkbox" checked={on} onChange={() => toggle(r.k)} className="mt-1 size-4 shrink-0 accent-key" />
                      <span className="w-20 shrink-0 text-[13px] text-mute md:w-24">{r.label}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block whitespace-pre-line text-[14px] font-medium">{r.value}</span>
                        <span className="block text-[12px] text-mute">
                          {r.from ? `근거: ${r.from}` : "근거: 추정"}
                          {r.now.dirty && r.now.text !== r.value ? ` · 지금 입력: ${r.now.text.length > 24 ? `${r.now.text.slice(0, 24)}…` : r.now.text || "—"} (체크하면 덮어써요)` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-end gap-2">
            <span className="flex-1 text-[12px] text-mute">채운 뒤 고칠 수 있어요 · 등록은 선생님이 해요</span>
            <Button type="button" size="sm" kind="ghost" onClick={() => setClosed(n)}>닫기</Button>
            <Button type="button" size="sm" kind="soft" disabled={rows.every((r) => unchecked.includes(r.k))}
              onClick={() => { onApply(rows.map((r) => r.k).filter((k) => !unchecked.includes(k)), f); setClosed(n); setFiles([]); }}>
              확인 후 채우기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
