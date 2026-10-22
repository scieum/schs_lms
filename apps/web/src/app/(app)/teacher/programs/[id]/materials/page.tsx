import Link from "next/link";
import { AlertCircle, Check, ClipboardList, FileText, Scissors, Upload } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Button, ButtonLink, Card, Steps, cx } from "@/components/ui";
import { usesDocs, type EvidenceSource, type Material } from "@/lib/domain/program";
import { aiEnabled } from "@/lib/server/ai/claude";
import { programRows, requireProgram } from "../../_lib/data";
import { assignMaterial, setMissing, setSource } from "./actions";
import { FileList, type FileItem } from "./file-list";
import { ReadBox, UploadBox } from "./parts";
import { makeStudentNo } from "@/lib/domain/roster";
import { RetentionLine, RetentionNotice } from "@/components/materials/retention-notice";
import { baseLine, kstToday } from "@/lib/domain/retention";
import { programRetention } from "@/lib/server/retention-sweep";

export const metadata = { title: "초안 자료 등록 · 속초고 쌤기부" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> };

const SOURCES: [EvidenceSource, string, string, typeof ClipboardList][] = [
  ["docs", "학생 제출 서류", "보고서·활동지·소감문 등 제출물로 작성", Upload],
];
const MODES = [["bulk", "일괄 업로드"], ["one", "개별 업로드"], ["bundle", "합본 PDF 나누기"]] as const;

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
const BY: Record<string, string> = { studentNo: "학번으로 자동 매칭", name: "이름으로 매칭", manual: "직접 지정", ai: "AI 표지 읽기", split: "합본에서 나눔", student: "학생이 제출" };

export default async function MaterialsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { program: p } = await requireProgram(id);
  const q = await searchParams;
  const mode = (MODES.find(([k]) => k === q.mode)?.[0] ?? "bulk") as "bulk" | "one" | "bundle";
  const [{ rows, materials }, ret] = await Promise.all([programRows(p), programRetention(p)]);
  const today = kstToday();
  const purgedOn = materials.length && materials.every((m) => m.purgedAt) ? materials.reduce((d, m) => (m.purgedAt! > d ? m.purgedAt! : d), "").slice(0, 10) : null;
  const nameOf = new Map(rows.map((r) => [r.student.id, r.student.name]));
  const opts = rows.map((r) => ({ id: r.student.id, label: `${makeStudentNo(r.student.grade, r.student.classNo, r.student.number)} ${r.student.name}` }));
  const docs = usesDocs(p.source);

  const counts = {
    matched: materials.filter((m) => m.status === "matched").length,
    review: materials.filter((m) => m.status === "needs_review").length,
    bundle: materials.filter((m) => m.status === "bundle").length,
  };
  const ok = rows.filter((r) => r.hasEvidence || r.missingReason).length;
  const missing = rows.filter((r) => !r.hasEvidence);
  const toRead = materials.filter((m) => m.mime !== "text/plain" && (m.status === "needs_review" || (m.status === "matched" && !m.text))).length;
  const step = !docs ? 2 : materials.length === 0 ? 1 : counts.review + counts.bundle > 0 ? 2 : 3;

  const metaOf = (m: Material) => m.status === "matched" ? `${nameOf.get(m.studentId ?? "") ?? "?"} · ${BY[m.matchedBy ?? ""] ?? ""}${m.text ? " · 글 읽음" : ""}` : m.status === "needs_review" ? "학생을 지정해 주세요" : m.status === "bundle" ? "합본 파일 · 여러 학생" : "나누기 완료 (원본)";
  const fileItem = (m: Material): FileItem => ({
    id: m.id,
    fileName: m.fileName,
    status: m.status,
    sub: m.status === "matched" ? nameOf.get(m.studentId ?? "") ?? "" : "",
    body: (
      <>
        <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-field", m.status === "needs_review" ? "bg-wait-soft text-wait" : "bg-soft text-sub")}><FileText size={18} /></span>
        <div className="min-w-0 flex-1">
          {m.purgedAt ? <span className="block truncate text-[14px] font-bold text-mute">{m.fileName}</span> : <a href={`/teacher/programs/${p.id}/materials/file/${m.id}`} target="_blank" rel="noreferrer" className="block truncate text-[14px] font-bold hover:underline">{m.fileName}</a>}
          <div className="flex items-center gap-1 truncate text-[12px] text-mute">
            {m.status === "matched" ? <Check size={13} className="shrink-0 text-ok" /> : m.status === "needs_review" ? <AlertCircle size={13} className="shrink-0 text-wait" /> : null}
            {kb(m.size)}{m.pages ? ` · ${m.pages}쪽` : ""} · {metaOf(m)}{m.purgedAt ? ` · 원본 지움 ${m.purgedAt.slice(0, 10)}` : ""}
          </div>
        </div>
      </>
    ),
    actions: (
      <>
        {m.status === "needs_review" && (
          <form action={assignMaterial} className="flex shrink-0 items-center gap-1.5">
            <input type="hidden" name="programId" value={p.id} />
            <input type="hidden" name="materialId" value={m.id} />
            <select name="studentId" required defaultValue="" className="h-9 w-28 rounded-field bg-soft px-2 text-[13px] outline-none md:w-36" aria-label="학생 지정">
              <option value="" disabled>학생 지정</option>
              {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <Button size="sm" kind="outline">지정</Button>
          </form>
        )}
        {m.status === "bundle" && <ButtonLink href={`/teacher/programs/${p.id}/split?file=${m.id}`} size="sm" kind="outline" className="shrink-0"><Scissors size={14} /> 페이지 나누기</ButtonLink>}
      </>
    ),
  });
  const shownFiles = mode === "bundle" ? materials.filter((m) => m.status === "bundle" || m.status === "split_done") : materials.filter((m) => m.status !== "split_done");

  return (
    <>
      <PageHeader
        title="초안 자료 등록"
        actions={
          <>
            <ButtonLink href={`/teacher/programs/${p.id}`} kind="outline" size="sm">{p.title}</ButtonLink>
            <span className="hidden md:block"><ButtonLink href={`/teacher/programs/${p.id}`} size="sm">다음: 초안 만들기</ButtonLink></span>
          </>
        }
      />
      <PageBody>
        <div className="overflow-x-auto"><Steps items={["자료 선택", "업로드", "학생 매칭·확인", "초안 생성"]} active={step} /></div>
        {docs && <ReadBox programId={p.id} pending={toRead} aiOn={aiEnabled()} students={opts} />}
        {docs && materials.length > 0 && <RetentionNotice rawDue={ret.rawDue} textDue={ret.textDue} base={baseLine(p.endDate, ret.settings.raw_files, ret.termEnds)} today={today} purgedOn={purgedOn} />}

        <Card title="어떤 자료로 초안을 만들까요?">
          <div className="grid gap-2.5 md:grid-cols-3">
            {SOURCES.map(([v, t, d, I]) => (
              <form key={v} action={setSource}>
                <input type="hidden" name="programId" value={p.id} />
                <input type="hidden" name="source" value={v} />
                <button aria-pressed={p.source === v}
                  className={cx("grid h-full w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-inner border-2 bg-white p-4 text-left md:items-start", p.source === v ? "border-key" : "border-transparent hover:bg-key-soft")}>
                  <span className={cx("col-start-1 row-start-1 flex size-9 items-center justify-center rounded-field", p.source === v ? "bg-key text-white" : "bg-soft")}><I size={18} /></span>
                  <span className={cx("col-start-3 row-start-1 flex size-5 items-center justify-center rounded-full border-2", p.source === v ? "border-key" : "border-hair")} aria-hidden>
                    {p.source === v && <span className="size-2.5 rounded-full bg-key" />}
                  </span>
                  <span className="col-start-2 row-start-1 flex flex-col gap-1 md:col-span-3 md:col-start-1 md:row-start-2">
                    <span className="font-bold">{t}</span>
                    <span className="text-[13px] text-mute">{d}</span>
                  </span>
                </button>
              </form>
            ))}
          </div>
        </Card>

        {docs ? (
          <Card title="학생 제출 서류 올리기">
            <nav className="mb-4 flex gap-1 rounded-control bg-white p-1 text-[13px] md:w-fit">
              {MODES.map(([k, label]) => (
                <Link key={k} href={`/teacher/programs/${p.id}/materials?mode=${k}`} aria-current={mode === k ? "page" : undefined}
                  className={cx("flex-1 whitespace-nowrap rounded-chip px-2 py-1.5 text-center md:flex-none md:px-3", mode === k ? "bg-soft font-bold text-ink" : "text-mute")}>{label}</Link>
              ))}
            </nav>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-6">
              <UploadBox programId={p.id} mode={mode} students={opts} />
              <FileList programId={p.id} items={shownFiles.map(fileItem)} footer={purgedOn ? null : <RetentionLine due={ret.rawDue} today={today} />} />
            </div>
          </Card>
        ) : (
          <Card><p className="py-4 text-center text-sm text-sub">예전 설문 프로그램이에요. 서류로 쓰려면 위에서 “학생 제출 서류”를 골라 주세요</p></Card>
        )}

        <section className="rounded-card bg-navy p-5 text-white md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-[17px] font-bold">{rows.length}명 중 {ok}명 자료 확인 완료</h2>
            {missing.length > 0 && <span className="rounded-chip bg-navy-2 px-2.5 py-1 text-xs">미제출 {missing.length}명</span>}
          </div>
          {missing.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {missing.map((r) => (
                <li key={r.student.id}>
                  <form action={setMissing} className="flex items-center gap-2">
                    <input type="hidden" name="programId" value={p.id} />
                    <input type="hidden" name="studentId" value={r.student.id} />
                    <span className="w-32 shrink-0 truncate text-[14px]">{makeStudentNo(r.student.grade, r.student.classNo, r.student.number)} {r.student.name}</span>
                    <input name="reason" defaultValue={r.missingReason ?? ""} maxLength={100} placeholder="미제출 사유 (남기면 다음으로 넘어갈 수 있어요)"
                      className="h-9 min-w-0 flex-1 rounded-field bg-navy-2 px-3 text-[13px] text-white outline-none placeholder:text-[#9eaaff] focus:ring-2 focus:ring-key" />
                    <button className="h-9 shrink-0 rounded-control bg-white/10 px-3 text-[13px] hover:bg-white/20">저장</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageBody>
    </>
  );
}
