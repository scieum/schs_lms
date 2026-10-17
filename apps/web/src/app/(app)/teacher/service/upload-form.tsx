"use client";
import { useState, useTransition } from "react";
import { FileUp, Plus, Sparkles, X } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { batchBySize, prepareUploads } from "@/lib/client/shrink-upload";
import { scanServiceDocs, sendServices, type ScanState, type SendState, type ServiceRowDraft } from "./actions";

const INPUT = "h-10 w-full min-w-0 rounded-field bg-white px-3 text-[14px] outline-none focus:ring-2 focus:ring-key";
type S = { id: string; label: string };

// 확인서 여러 장 올리기 → AI가 읽고 학생 자동 매칭 → 표에서 확인·수정 → 모두 보내기
export function ServiceUploadForm({ students, aiOn, today }: { students: S[]; aiOn: boolean; today: string }) {
  // 읽기·보내기는 파일을 3.5MB 묶음으로 나눠 차례로 부른다 (웹 4.5MB 제한)
  const [scan, setScan] = useState<ScanState>({});
  const [scanning, startScan] = useTransition();
  const [send, setSend] = useState<SendState>({});
  const [sending, startSend] = useTransition();
  // 보낸 뒤(send.n 이 바뀌면) 고른 파일·표를 비운다
  const [picked, setPicked] = useState<{ n: number; v: number; files: File[]; manual: number }>({ n: 0, v: 0, files: [], manual: 0 });
  // 마지막으로 읽은 파일 묶음 (파일을 다시 고르면 이전 표는 숨긴다)
  const [scannedV, setScannedV] = useState(-1);
  const done = send.sent !== undefined && picked.n !== (send.n ?? 0);
  const files = done ? [] : picked.files;

  // 큰 PDF 는 쪽 단위로 나누고 큰 사진은 줄인다 (웹은 한 번에 4.5MB까지만 받음)
  const pick = async (list: FileList | null) => {
    const ready = await prepareUploads(Array.from(list ?? []));
    setPicked({ n: send.n ?? 0, v: picked.v + 1, files: [...files, ...ready].slice(0, 20), manual: 0 });
  };
  const batches = () => {
    let at = 0;
    return batchBySize(files).map((b) => { const start = at; at += b.length; return { files: b, start }; });
  };
  const runScan = () => {
    setScannedV(picked.v);
    startScan(async () => {
      const rows: ServiceRowDraft[] = [];
      try {
        for (const b of batches()) {
          const fd = new FormData();
          b.files.forEach((f) => fd.append("file", f));
          const r = await scanServiceDocs({}, fd);
          if (r.error) { setScan({ error: r.error, n: (scan.n ?? 0) + 1 }); return; }
          rows.push(...(r.rows ?? []).map((x) => ({ ...x, fileIndex: x.fileIndex + b.start, key: `${x.fileIndex + b.start}-${x.key}` })));
        }
        setScan({ rows, n: (scan.n ?? 0) + 1 });
      } catch {
        setScan({ error: "파일을 보내지 못했어요. 파일 수를 줄여 다시 해 주세요", n: (scan.n ?? 0) + 1 });
      }
    });
  };
  type SendRow = { fileIndex: number; studentId: string; date: string; endDate: string; hours: string; organization: string; activity: string };
  const runSend = (payload: SendRow[]) => startSend(async () => {
    let sent = 0;
    try {
      for (const b of batches()) {
        const mine = payload.filter((r) => r.fileIndex >= b.start && r.fileIndex < b.start + b.files.length).map((r) => ({ ...r, fileIndex: r.fileIndex - b.start }));
        if (!mine.length) continue;
        const fd = new FormData();
        b.files.forEach((f) => fd.append("file", f));
        fd.set("rows", JSON.stringify(mine));
        const r = await sendServices({}, fd);
        if (r.error) { setSend({ error: sent ? `${sent}건은 보냈고, 나머지에서 멈췄어요: ${r.error}` : r.error, n: (send.n ?? 0) + 1 }); return; }
        sent += mine.length;
      }
      setSend({ sent: `${sent}건을 담임 선생님께 보냈어요`, n: (send.n ?? 0) + 1 });
    } catch {
      setSend({ error: "보내지 못했어요. 잠시 뒤 다시 해 주세요", n: (send.n ?? 0) + 1 });
    }
  });
  // AI 없이: 파일마다 빈 줄 하나
  const manualRows: ServiceRowDraft[] = files.map((f, i) => ({
    key: `m${i}`, fileIndex: i, fileName: f.name, studentId: null, studentHint: null, date: today, endDate: today, hours: null, organization: "", activity: "", error: null,
  }));
  const rows = done ? null : picked.manual ? manualRows : scan.rows && scannedV === picked.v ? scan.rows : null;

  return (
    <div className="flex flex-col gap-4">
      <label className={cx("flex cursor-pointer items-center gap-3 rounded-inner border-2 border-dashed border-hair bg-white px-4 py-5", files.length > 0 && "border-key")}>
        <FileUp size={22} className="shrink-0 text-key" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{files.length ? `확인서 ${files.length}개 골랐어요` : "확인서 파일 고르기 (여러 개 가능)"}</span>
          <span className="block truncate text-[13px] text-mute">{files.length ? files.map((f) => f.name).join(", ") : "PDF · JPG · PNG, 한 번에 20개 · 단체 확인서도 돼요"}</span>
        </span>
        <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
      </label>

      <div className="flex flex-wrap items-center gap-3 rounded-inner bg-new-soft px-4 py-3">
        <span className="rounded-chip bg-white px-2 py-0.5 text-xs font-bold text-new">AI</span>
        <span className="min-w-0 flex-1 text-[13px] text-sub">
          {aiOn ? "확인서를 읽어 학번·이름으로 학생을 자동으로 찾고 기간·시간·기관을 채워요" : "AI 읽기가 꺼져 있어요. 직접 입력해 주세요"}
        </span>
        {aiOn ? (
          <Button type="button" onClick={runScan} kind="soft" size="sm" disabled={!files.length || scanning}>
            <Sparkles size={14} /> {scanning ? `읽는 중… (${files.length}개)` : "읽고 학생 매칭"}
          </Button>
        ) : (
          <Button type="button" onClick={() => setPicked({ ...picked, manual: picked.manual + 1 })} kind="outline" size="sm" disabled={!files.length}>직접 입력</Button>
        )}
      </div>
      {scan.error && <p className="text-sm text-bad" role="alert">{scan.error}</p>}
      {send.sent && <p className="text-sm text-ok" role="status">{send.sent}</p>}

      {rows && rows.length > 0 && (
        <RowsEditor
          key={`${scan.n ?? 0}-${picked.manual}`}
          initial={rows}
          files={files}
          students={students}
          sending={sending}
          error={send.error}
          onSend={runSend}
        />
      )}
    </div>
  );
}

type Edit = ServiceRowDraft & { on: boolean };

function RowsEditor({ initial, files, students, sending, error, onSend }: {
  initial: ServiceRowDraft[]; files: File[]; students: S[]; sending: boolean; error?: string;
  onSend: (rows: { fileIndex: number; studentId: string; date: string; endDate: string; hours: string; organization: string; activity: string }[]) => void;
}) {
  const [rows, setRows] = useState<Edit[]>(initial.map((r) => ({ ...r, on: !r.error })));
  const set = (key: string, patch: Partial<Edit>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const matched = rows.filter((r) => r.studentId).length;
  const chosen = rows.filter((r) => r.on);
  const missing = chosen.filter((r) => !r.studentId).length;
  // 단체 확인서: 같은 파일로 학생 한 줄 더
  const addRow = (r: Edit) => setRows([...rows, { ...r, key: `${r.key}+${rows.length}`, studentId: null, studentHint: null, error: null, on: true }]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[13px]">
        <span className="font-bold">자동 매칭 {matched}/{rows.length}</span>
        {matched < rows.length && <span className="text-wait">· 못 찾은 {rows.length - matched}명은 학생을 골라 주세요</span>}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className={cx("flex flex-col gap-2 rounded-inner bg-white p-3", !r.on && "opacity-50")}>
            <div className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={r.on} onChange={(e) => set(r.key, { on: e.target.checked })} aria-label="이 줄 보내기" className="size-4 accent-[var(--color-key)]" />
              <span className="min-w-0 flex-1 truncate text-mute">{r.fileName}</span>
              {r.error ? <span className="shrink-0 text-bad">못 읽음</span> : r.studentId ? <span className="shrink-0 rounded-chip bg-ok-soft px-2 py-0.5 text-ok">자동 매칭</span> : <span className="shrink-0 rounded-chip bg-wait-soft px-2 py-0.5 text-wait">학생 확인</span>}
              <button type="button" onClick={() => addRow(r)} className="shrink-0 text-mute hover:text-key" aria-label="같은 확인서에 학생 추가" title="같은 확인서에 학생 추가"><Plus size={15} /></button>
              <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="shrink-0 text-mute hover:text-bad" aria-label="이 줄 빼기"><X size={15} /></button>
            </div>
            {r.studentHint && <p className="text-[12px] text-wait">확인서의 학생: {r.studentHint} — 명단에서 찾지 못했어요</p>}
            <div className="grid gap-2 md:grid-cols-[1.3fr_1fr_1fr_0.6fr]">
              <select value={r.studentId ?? ""} onChange={(e) => set(r.key, { studentId: e.target.value || null })} className={INPUT} aria-label="학생">
                <option value="">학생 고르기</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <input type="date" value={r.date ?? ""} onChange={(e) => set(r.key, { date: e.target.value, endDate: !r.endDate || r.endDate < e.target.value ? e.target.value : r.endDate })} className={INPUT} aria-label="시작일" />
              <input type="date" value={r.endDate ?? ""} min={r.date ?? undefined} onChange={(e) => set(r.key, { endDate: e.target.value })} className={INPUT} aria-label="마감일" />
              <input inputMode="decimal" value={r.hours ?? ""} onChange={(e) => set(r.key, { hours: e.target.value === "" ? null : Number(e.target.value) })} placeholder="시간" className={INPUT} aria-label="시간" />
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_1.6fr]">
              <input value={r.organization} onChange={(e) => set(r.key, { organization: e.target.value })} placeholder="기관 (예: 속초시노인복지관)" maxLength={60} className={INPUT} aria-label="기관" />
              <input value={r.activity} onChange={(e) => set(r.key, { activity: e.target.value })} placeholder="활동 내용 (예: 급식 배식 보조)" maxLength={200} className={INPUT} aria-label="활동 내용" />
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <Button
        type="button"
        disabled={sending || chosen.length === 0 || missing > 0 || files.length === 0}
        onClick={() => onSend(chosen.map((r) => ({
          fileIndex: r.fileIndex, studentId: r.studentId ?? "", date: r.date ?? "", endDate: r.endDate ?? "",
          hours: r.hours === null ? "" : String(r.hours), organization: r.organization, activity: r.activity,
        })))}
      >
        {sending ? "보내는 중…" : missing ? `학생 ${missing}명을 골라 주세요` : `${chosen.length}건 모두 담임에게 보내기`}
      </Button>
    </div>
  );
}
