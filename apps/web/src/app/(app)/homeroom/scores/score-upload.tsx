"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { Download, FileText, RotateCw, Upload } from "lucide-react";
import { KV } from "@/components/scores/parts";
import { AiBanner, Button, ButtonLink, Card, cx, Steps, Tag } from "@/components/ui";
import {
  colLetter, SCORE_FIELD_LABEL, SCORE_FIELDS, SUBJECT_LABEL, SUBJECTS,
  type CheckedScoreRow, type ColumnMap, type ScoreField, type ScoreRowStatus,
} from "@/lib/domain/scores";
import { addExam, commitScores, errorRowsFile, previewScores, suggestColumns, type ExamState, type UploadState } from "./actions";

type ExamOpt = { id: string; name: string; year: number; month: number; uploaded: number };

const STATUS_TONE: Record<ScoreRowStatus, string> = {
  정상: "bg-ok-soft text-ok",
  "빈 칸": "bg-navy text-white",
  "범위 오류": "bg-bad-soft text-bad",
  "이름 불일치": "bg-bad-soft text-bad",
  "명단에 없음": "bg-bad-soft text-bad",
  "번호 중복": "bg-bad-soft text-bad",
};

export function ScoreUpload({ classKey, className, rosterSize, exams, ai }: { classKey: string; className: string; rosterSize: number; exams: ExamOpt[]; ai: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [examChoice, setExamChoice] = useState<string | null>(null);
  const [state, preview, previewing] = useActionState<UploadState, FormData>(previewScores, { kind: "idle" });
  const [result, commit, committing] = useActionState<UploadState, FormData>(commitScores, { kind: "idle" });
  const [examState, addExamAction, addingExam] = useActionState<ExamState, FormData>(addExam, {});
  const [editMap, setEditMap] = useState<ColumnMap | null>(null);
  const [aiMap, setAiMap] = useState<{ map: ColumnMap; error?: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [dlError, setDlError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const examId = examChoice ?? examState.createdId ?? exams[0]?.id ?? "";
  const exam = exams.find((e) => e.id === examId);
  const done = result.kind === "done" ? result : null;
  const p = state.kind === "preview" ? state : null;
  const mapping = state.kind === "mapping" ? state : null;
  const headers = p?.headers ?? mapping?.headers ?? [];
  const currentMap: ColumnMap = editMap ?? aiMap?.map ?? p?.map ?? mapping?.map ?? {};
  const step = done ? 3 : p ? 2 : mapping || editMap ? 1 : 0;

  const form = (extra: Record<string, string> = {}) => {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("class", classKey);
    fd.set("examId", examId);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  };
  const run = (f: File | null, map?: ColumnMap) => {
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    fd.set("class", classKey);
    if (map) fd.set("map", JSON.stringify(map));
    setEditMap(null);
    setAiMap(null);
    startTransition(() => preview(fd));
  };

  async function askAi() {
    if (!headers.length) return;
    setAiBusy(true);
    const r = await suggestColumns(headers);
    setAiBusy(false);
    setAiMap(r.ok ? { map: r.map } : { map: currentMap, error: r.error });
  }

  async function downloadErrors() {
    setDlError("");
    const r = await errorRowsFile(form(p ? { map: JSON.stringify(p.map) } : {}));
    if (!r.ok) return setDlError(r.error);
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${className}_${exam?.name ?? "성적"}_확인필요.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const renamedLine = p?.renamed.length
    ? p.renamed.map((r) => `'${r.from}' → ${SCORE_FIELD_LABEL[r.to]}`).join(" · ")
    : "열 이름이 달라도 제목만 보고 맞춰요 · 학생 이름·성적은 보내지 않아요";
  const showMapEditor = !!(mapping || editMap || aiMap);
  const rows = p ? (onlyIssues ? p.rows.filter((r) => r.status !== "정상") : p.rows) : [];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Steps items={["파일 선택", "열 맞추기", "검증", "반영"]} active={step} />

      <AiBanner
        title="AI로 엑셀 열 맞추기"
        line={aiMap?.error ?? (aiMap ? "AI 제안을 확인하고 '확인 후 업로드'를 눌러 주세요" : renamedLine)}
        action={
          headers.length > 0 && !done ? (
            aiMap && !aiMap.error ? (
              <Button size="sm" onClick={() => run(file, aiMap.map)} disabled={previewing}>확인 후 업로드</Button>
            ) : (
              <Button size="sm" kind={mapping ? "primary" : "soft"} onClick={askAi} disabled={aiBusy || !ai}>
                {aiBusy ? "맞추는 중…" : ai ? "AI 제안" : "AI 꺼짐"}
              </Button>
            )
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          <Card className={cx(!p && !showMapEditor && !done && "flex-1")}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-field bg-white text-sub">
                  {file ? <FileText size={20} /> : <Upload size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold">{file?.name ?? "성적 파일을 올려 주세요"}</div>
                  <div className="text-[13px] text-mute">{p ? `${p.summary.total}행 읽음 · ${className}` : `xlsx · 2MB까지 · ${className}`}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="시험"
                  value={examId}
                  onChange={(e) => setExamChoice(e.target.value)}
                  className="min-w-0 flex-1 rounded-control border border-hair bg-white px-3 py-2 text-[13px] md:flex-none"
                >
                  {exams.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.year} {e.name}{e.uploaded ? ` · ${e.uploaded}명 반영됨` : ""}
                    </option>
                  ))}
                </select>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    run(f);
                    e.currentTarget.value = "";
                  }}
                />
                <Button type="button" kind="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={previewing}>
                  {file ? <RotateCw size={14} /> : <Upload size={14} />} {previewing ? "읽는 중…" : file ? "다시 올리기" : "파일 고르기"}
                </Button>
              </div>
            </div>
            <form
              action={addExamAction}
              onSubmit={() => setExamChoice(null)}
              className="mt-3 flex items-center gap-2 text-[13px] text-mute"
            >
              <span>시험이 없으면</span>
              <input type="hidden" name="year" value={new Date().getFullYear()} />
              <select name="month" aria-label="월" defaultValue={String(new Date().getMonth() + 1)} className="rounded-control border border-hair bg-white px-2 py-1.5">
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}
              </select>
              <Button size="sm" kind="ghost" disabled={addingExam}>시험 추가</Button>
              {examState.error && <span className="text-bad">{examState.error}</span>}
            </form>
            {state.kind === "error" && <p className="mt-3 text-sm text-bad" role="alert">{state.message}</p>}
          </Card>

          {p && (
            <Card title="검증 결과">
              <div className="mb-3 flex gap-2">
                {[
                  [false, `전체 ${p.summary.total}`],
                  [true, `확인 필요 ${p.summary.needsCheck}`],
                ].map(([v, label]) => (
                  <button
                    key={String(label)}
                    type="button"
                    onClick={() => setOnlyIssues(v as boolean)}
                    className={cx("rounded-control px-3.5 py-2 text-[13px]", onlyIssues === v ? "bg-key font-bold text-white" : "bg-white text-sub")}
                  >
                    {label as string}
                  </button>
                ))}
              </div>
              {/* PC: 표 */}
              <div className="hidden max-h-[560px] overflow-auto md:block">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-14" />
                    <col />
                    {SUBJECTS.map((k) => <col key={k} className="w-16" />)}
                    <col className="w-28" />
                  </colgroup>
                  <thead className="text-left text-xs text-mute">
                    <tr className="border-b border-line">
                      <th className="py-2 text-center font-normal">번호</th>
                      <th className="py-2 pl-2 font-normal">이름</th>
                      {SUBJECTS.map((k) => <th key={k} className="px-1 py-2 text-center font-normal">{SUBJECT_LABEL[k]}</th>)}
                      <th className="py-2 text-center font-normal">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => <PcRow key={r.line} r={r} />)}
                  </tbody>
                </table>
              </div>
              {/* 모바일: 확인 필요 행 위주 목록 */}
              <div className="flex flex-col gap-2 md:hidden">
                {(onlyIssues ? rows : rows.filter((r) => r.status !== "정상")).map((r) => (
                  <div key={r.line} className="flex items-center gap-3 rounded-inner bg-white px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{r.name || `${r.line}행`}{r.number !== null ? ` · ${r.number}번` : ""}</div>
                      <div className="truncate text-xs text-mute">{r.problems[0] ?? ""}</div>
                    </div>
                    <Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag>
                  </div>
                ))}
                {!onlyIssues && p.summary.needsCheck === 0 && <p className="py-4 text-center text-sm text-mute">모든 행이 정상이에요</p>}
              </div>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4 md:gap-6">
          {done ? (
            <Card title="반영 완료">
              <p className="text-[15px]"><strong>{done.count}명</strong>의 {done.examName} 성적을 반영했어요.</p>
              <ButtonLink href={`/homeroom/minimum?class=${classKey}`} className="mt-4 w-full">수능 최저 판정 보기</ButtonLink>
            </Card>
          ) : (
            (p || showMapEditor) && (
              <Card title="열 맞추기" action={p && !showMapEditor ? <Button size="sm" kind="ghost" onClick={() => setEditMap(p.map)}>고치기</Button> : undefined}>
                {showMapEditor ? (
                  <MapEditor headers={headers} map={currentMap} aiFields={aiMap && !aiMap.error ? aiMap.map : null} onChange={(m) => setEditMap(m)} />
                ) : (
                  <dl>
                    {SCORE_FIELDS.map((f) => (
                      <KV key={f} k={`${colLetter(p!.map[f]!)}열 ${p!.headers[p!.map[f]!] || ""}`} v={SCORE_FIELD_LABEL[f]} strong />
                    ))}
                  </dl>
                )}
                {showMapEditor && (
                  <Button className="mt-4 w-full" kind="outline" onClick={() => run(file, currentMap)} disabled={previewing || !file}>
                    이 열로 다시 검사
                  </Button>
                )}
                {p && !showMapEditor && (
                  <>
                    <Button
                      className="mt-4 w-full"
                      disabled={committing || p.summary.applicable === 0 || !examId}
                      onClick={() => startTransition(() => commit(form({ map: JSON.stringify(p.map) })))}
                    >
                      {committing ? "반영하는 중…" : `${p.summary.applicable}명 반영하기`}
                    </Button>
                    {p.summary.needsCheck > 0 && (
                      <Button className="mt-2 w-full" kind="outline" onClick={downloadErrors}>
                        <Download size={16} /> 오류 행만 내려받기
                      </Button>
                    )}
                    <div className="mt-3 flex flex-col gap-1 text-[13px] text-mute">
                      {p.summary.blocked && <p className="text-bad" role="alert">번호·이름이 명단과 다른 행이 {p.summary.mismatch}개 있어요. 고쳐서 다시 올려야 반영돼요</p>}
                      {!p.summary.blocked && p.summary.range > 0 && <p>범위 오류 {p.summary.range}행은 빼고 반영해요</p>}
                      {!p.summary.blocked && p.summary.blank > 0 && <p>빈 칸은 결시로 반영돼요</p>}
                      {p.summary.notInFile > 0 && <p>파일에 없는 학생 {p.summary.notInFile}명 (전체 {rosterSize}명)</p>}
                      {exam && exam.uploaded > 0 && <p>{exam.name}은 이미 {exam.uploaded}명 반영돼 있어요. 다시 반영하면 새 값이 쓰여요</p>}
                    </div>
                    {result.kind === "error" && <p className="mt-2 text-sm text-bad" role="alert">{result.message}</p>}
                    {dlError && <p className="mt-2 text-sm text-bad" role="alert">{dlError}</p>}
                  </>
                )}
              </Card>
            )
          )}
          {!p && !showMapEditor && !done && (
            <Card title="올리는 방법" className="flex-1">
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-sub">
                <li>양식을 내려받아 등급(1~9)을 채워요</li>
                <li>시험을 고르고 파일을 올려요</li>
                <li>확인 필요 행을 보고 반영해요</li>
              </ol>
              <p className="mt-3 text-[13px] text-mute">과목: 국어·수학·영어·한국사·탐구1(통합사회)·탐구2(통합과학)</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function PcRow({ r }: { r: CheckedScoreRow }) {
  return (
    <tr className="border-b border-line last:border-0" title={r.problems.join(" · ") || undefined}>
      <td className="py-3.5 text-center font-medium tabular-nums">{r.raw.number || "–"}</td>
      <td className="truncate py-3.5 pl-2 font-bold">{r.raw.name || "–"}</td>
      {SUBJECTS.map((k) => {
        const v = r.raw[k];
        const bad = r.status === "범위 오류" && r.problems.some((x) => x.startsWith(SUBJECT_LABEL[k]));
        return (
          <td key={k} className={cx("px-1 py-3.5 text-center tabular-nums", bad ? "font-bold text-bad" : "text-sub")}>
            {v || "—"}
          </td>
        );
      })}
      <td className="py-3.5 text-center"><Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag></td>
    </tr>
  );
}

function MapEditor({ headers, map, aiFields, onChange }: { headers: string[]; map: ColumnMap; aiFields: ColumnMap | null; onChange: (m: ColumnMap) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {SCORE_FIELDS.map((f: ScoreField) => (
        <label key={f} className="flex items-center gap-2 text-sm">
          <span className="w-14 shrink-0 font-medium">{SCORE_FIELD_LABEL[f]}</span>
          <select
            value={map[f] ?? ""}
            onChange={(e) => {
              const next = { ...map };
              if (e.target.value === "") delete next[f];
              else next[f] = Number(e.target.value);
              onChange(next);
            }}
            className={cx("min-w-0 flex-1 rounded-control border bg-white px-2.5 py-2 text-[13px]", map[f] === undefined ? "border-bad" : "border-hair")}
          >
            <option value="">고르기</option>
            {headers.map((h, i) => (
              <option key={i} value={i}>{colLetter(i)}열 {h}</option>
            ))}
          </select>
          {aiFields && aiFields[f] !== undefined && <Tag tone="bg-new-soft text-new">AI</Tag>}
        </label>
      ))}
    </div>
  );
}
