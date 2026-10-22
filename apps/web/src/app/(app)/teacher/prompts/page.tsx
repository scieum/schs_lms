import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { isAdmin } from "@/lib/domain/policy";
import { canEditPrompt, filterPrompts, isPromptTab, promptsOf, type PromptDoc } from "@/lib/domain/prompt-library";
import { recordSystemPrompt, type RecordKind } from "@/lib/server/ai/record-prompts";
import { repo } from "@/lib/server/repo";
import { requireCan } from "@/lib/server/viewer";
import { NewPromptButton, PromptsBoard } from "./board";

export const metadata = { title: "프롬프트 보관함 · 속초고 쌤기부" };

type Props = { searchParams: Promise<{ tab?: string; area?: string; q?: string; p?: string }> };

// 앱이 실제로 쓰는 기본 프롬프트 (record-prompts.ts) — 공식 탭 끝에 읽기 전용으로
const BUILTIN: { area: PromptDoc["area"]; kind: RecordKind; subject: string | null; title: string }[] = [
  ...["국어", "수학", "영어", "사회", "과학", "정보", "체육"].map((s) => ({ area: "세특" as const, kind: "세특" as const, subject: s, title: `앱 기본 — ${s} 세특` })),
  { area: "창체", kind: "자율·자치", subject: null, title: "앱 기본 — 자율·자치" },
  { area: "창체", kind: "동아리", subject: null, title: "앱 기본 — 동아리" },
  { area: "창체", kind: "진로", subject: null, title: "앱 기본 — 진로" },
  { area: "행발", kind: "행발", subject: null, title: "앱 기본 — 행동특성 및 종합의견" },
];
const builtins = (): PromptDoc[] => BUILTIN.map((b) => ({
  id: `builtin-${b.kind}-${b.subject ?? ""}`, official: true, public: true, builtin: true, area: b.area, subject: b.subject, title: b.title,
  body: recordSystemPrompt(b.kind, b.subject), authorId: null, authorName: "속초고 세특 프롬프트(앱)", stars: 0, starred: false, createdAt: "", updatedAt: "",
}));

// 프롬프트 보관함 (도구, 2026-10-22): 탭 공식 · 공유(★ 많은 순) · 내 프롬프트, 영역 칩 · 찾기. PC = 목록 · 글, 모바일 = 목록 → 글(?p=).
export default async function PromptsPage({ searchParams }: Props) {
  const v = await requireCan("record.write");
  const q = await searchParams;
  const tab = isPromptTab(q.tab) ? q.tab : "공식";
  const admin = isAdmin(v);
  // 남의 비공개 글은 여기서 뺀다
  const all = [...(await repo.listPrompts(v.accountId)).filter((p) => p.public || p.authorId === v.accountId), ...builtins()];
  const inTab = promptsOf(all, tab, v.accountId);
  const list = filterPrompts(inTab, { tab, area: q.area, text: q.q });
  const selected = all.find((p) => p.id === q.p) ?? list[0] ?? null;
  const counts = Object.fromEntries((["공식", "공유", "내 프롬프트"] as const).map((t) => [t, promptsOf(all, t, v.accountId).length]));
  return (
    <>
      <PageHeader title="프롬프트 보관함" actions={<NewPromptButton admin={admin} />} />
      <PageBody>
        <PromptsBoard
          prompts={list} counts={counts} tab={tab} area={q.area ?? "전체"} text={q.q ?? ""}
          selected={selected} detailOnly={!!q.p} me={v.accountId} admin={admin}
          editable={selected ? canEditPrompt(selected, { id: v.accountId, admin }) : false}
        />
      </PageBody>
    </>
  );
}
