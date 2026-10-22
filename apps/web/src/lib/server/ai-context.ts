import "server-only";
import { CHAT_LIMITS, type Mention } from "@/lib/domain/ai-chat";
import { scrubPeople } from "@/lib/domain/lesson-plan";
import { isAdmin } from "@/lib/domain/policy";
import { promptsOf } from "@/lib/domain/prompt-library";
import { reportAiLines, type ReportItem } from "@/lib/domain/report";
import type { Student, Viewer } from "@/lib/domain/types";
import { semesterOf } from "@/lib/domain/writing";
import { repo } from "./repo";
import { loadReports, reportScopes } from "./report";

// AI 작업창 @ 맥락 (Figma N70): 고를 수 있는 것 = 학생(학생 리포트 범위) · 수업(내 분반) · 프롬프트(공식 · 공유 · 내 것) · 협업방(든 방) · 팁.
// 학생 기록은 리포트와 같은 범위 · 권한, 상담 글은 넣지 않는다. 보낼 글의 이름 · 학번은 가리고 학생은 가명ID로만 (C2).

const STUDENT_ITEMS: ReportItem[] = ["setuk", "record", "behavior", "logs", "program", "service"];

/** @ 목록 */
export async function mentionOptions(v: Viewer): Promise<Mention[]> {
  if (v.kind !== "teacher") return [];
  const scopes = await reportScopes(v);
  const out: Mention[] = [];
  const all = await repo.listStudents();
  const seen = new Set<string>();
  for (const sc of scopes) {
    if (sc.kind === "course") out.push({ kind: "수업", id: sc.key, label: sc.label, sub: `${sc.count}명` });
    const reports = await loadReports(v, sc, semesterOf()).catch(() => null);
    for (const r of reports ?? []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const s = all.find((x) => x.id === r.id);
      out.push({ kind: "학생", id: `${sc.key}|${r.id}`, label: r.name, sub: `${sc.label}${s ? ` · ${s.studentNo}` : ""}` });
    }
  }
  const prompts = await repo.listPrompts(v.accountId);
  for (const p of [...promptsOf(prompts, "공식", v.accountId), ...promptsOf(prompts, "공유", v.accountId), ...prompts.filter((x) => !x.public && x.authorId === v.accountId)]) {
    out.push({ kind: "프롬프트", id: p.id, label: p.title, sub: [p.area, p.subject].filter(Boolean).join(" · ") });
  }
  for (const r of await repo.listRooms(v.accountId)) out.push({ kind: "협업방", id: r.id, label: r.name, sub: `멤버 ${r.memberIds.length}명` });
  for (const t of (await repo.listTips()).slice(0, 40)) out.push({ kind: "팁", id: t.id, label: t.title, sub: t.category });
  return out;
}

export type ChatContext = { blocks: string[]; aliases: Record<string, string>; hasStudent: boolean; people: Student[]; used: string[] };

/** 붙인 맥락 → AI에 넣을 글 덩어리. 볼 수 없는 것은 조용히 뺀다 */
export async function buildContext(v: Viewer, mentions: Mention[]): Promise<ChatContext> {
  const ctx: ChatContext = { blocks: [], aliases: {}, hasStudent: false, people: await repo.listStudents(), used: [] };
  if (v.kind !== "teacher") return ctx;
  const scopes = await reportScopes(v);
  const cut = (s: string, n = 6000) => (s.length > n ? `${s.slice(0, n)}…` : s);
  for (const m of mentions.slice(0, CHAT_LIMITS.mentions)) {
    if (m.kind === "학생") {
      const [key, sid] = m.id.split("|");
      const sc = scopes.find((x) => x.key === key);
      const r = sc ? (await loadReports(v, sc, "year"))?.find((x) => x.id === sid) : null;
      const s = r ? ctx.people.find((x) => x.id === r.id) : null;
      if (!r || !s) continue;
      const lines = reportAiLines(r, STUDENT_ITEMS);
      ctx.blocks.push(`<학생 id="${s.pseudonymId}" 범위="${sc!.label}">\n${lines.length ? cut(lines.join("\n")) : "(아직 기록 없음)"}\n</학생>`);
      ctx.aliases[s.pseudonymId] = s.name;
      ctx.hasStudent = true;
      ctx.used.push(`학생 ${s.name}`);
    } else if (m.kind === "수업") {
      const sc = scopes.find((x) => x.key === m.id && x.kind === "course");
      if (!sc?.courseId) continue;
      const [course, as] = await Promise.all([repo.getCourse(sc.courseId), repo.listAssessments({ courseId: sc.courseId, teacherId: v.accountId })]);
      if (!course) continue;
      const list = as.filter((a) => (a.section ?? null) === (sc.section ?? null) || !a.section).map((a) => `- ${a.date} ${a.title}${a.description ? `: ${a.description}` : ""}`);
      ctx.blocks.push(`<수업 이름="${sc.label}" 과목="${course.subject}" 학년="${course.grade}" 학기="${course.semester}" 학생수="${sc.count}">\n수행평가:\n${list.join("\n") || "(없음)"}\n</수업>`);
      ctx.used.push(`수업 ${sc.label}`);
    } else if (m.kind === "프롬프트") {
      const p = (await repo.listPrompts(v.accountId)).find((x) => x.id === m.id && (x.public || x.authorId === v.accountId));
      if (!p) continue;
      ctx.blocks.push(`<프롬프트 제목="${p.title}" 영역="${p.area}">\n${cut(p.body)}\n</프롬프트>`);
      ctx.used.push(`프롬프트 ${p.title}`);
    } else if (m.kind === "협업방") {
      const room = await repo.getRoom(m.id);
      if (!room || (!room.memberIds.includes(v.accountId) && !isAdmin(v))) continue;
      const items = (await repo.listItems([room.id])).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
      ctx.blocks.push(`<협업방 이름="${room.name}">\n${room.intro}\n${cut(items.map((x) => `[${x.kind}] ${x.title}${x.meta.date ? ` (${x.meta.date})` : ""}\n${x.body}`).join("\n\n"))}\n</협업방>`);
      ctx.used.push(`협업방 ${room.name}`);
    } else if (m.kind === "팁") {
      const t = (await repo.listTips()).find((x) => x.id === m.id);
      if (!t) continue;
      ctx.blocks.push(`<팁 제목="${t.title}">\n${cut(t.body, 3000)}\n</팁>`);
      ctx.used.push(`팁 ${t.title}`);
    }
  }
  // 학교 학생 이름 · 학번은 가린다 (붙인 학생은 가명ID 로 바꿔 둔 뒤)
  ctx.blocks = ctx.blocks.map((b) => scrub(b, ctx));
  let total = 0;
  ctx.blocks = ctx.blocks.filter((b) => (total += b.length) <= CHAT_LIMITS.context);
  return ctx;
}

/** 붙인 학생 이름 → 가명ID, 그 밖의 학교 학생 이름 · 학번 → "학생" · "학번" */
export function scrub(text: string, ctx: Pick<ChatContext, "aliases" | "people">): string {
  let out = text;
  for (const [pid, name] of Object.entries(ctx.aliases).sort((a, b) => b[1].length - a[1].length)) if (name.length >= 2) out = out.split(name).join(pid);
  return scrubPeople(out, ctx.people).text;
}

