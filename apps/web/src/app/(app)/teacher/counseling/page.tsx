import Link from "next/link";
import { ChevronLeft, Plus, ShieldCheck } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ActivityList } from "@/components/counsel/activity-list";
import { AiAttach } from "@/components/counsel/ai-attach";
import { CounselForm } from "@/components/counsel/counsel-form";
import { CounselList } from "@/components/counsel/counsel-list";
import { TabLinks } from "@/components/counsel/tab-links";
import { Avatar, ButtonLink, Card, StatTiles } from "@/components/ui";
import { today } from "@/lib/domain/activity";
import { canViewStudentRecord, countByStudent, counselStats, isHomeroomOf } from "@/lib/domain/counsel";
import { isAdmin } from "@/lib/domain/policy";
import {
  activityItems, loadAssigned, loadCounsel, loadStudentLogs, loadStudentService, loadStudentSetuk, teacherNames,
} from "@/lib/server/counsel";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireCan } from "@/lib/server/viewer";
import { suggestCounselQuestions, summarizeCounsel } from "./actions";
import { StudentPicker } from "./student-picker";
import { makeStudentNo } from "@/lib/domain/roster";

export const metadata = { title: "담당 학생·상담 · 속초고등학교 학생관리시스템" };

type Props = { searchParams: Promise<{ student?: string; tab?: string }> };
const TABS = ["counsel", "activity", "docs"] as const;
type TabKey = (typeof TABS)[number];

export default async function CounselingPage({ searchParams }: Props) {
  const v = await requireCan("counsel.write");
  const q = await searchParams;
  const tab: TabKey = (TABS as readonly string[]).includes(q.tab ?? "") ? (q.tab as TabKey) : "counsel";

  const students = await loadAssigned(v);
  const records = await loadCounsel(v, students);
  const counts = countByStudent(records);
  const stats = counselStats(students.map((s) => s.id), records);
  // 고른 학생: ?student= (담당 학생만). 없으면 최근 상담한 학생 → 첫 학생
  const selected = students.find((s) => s.id === q.student) ?? students.find((s) => s.id === records[0]?.studentId) ?? students[0] ?? null;

  const names = await teacherNames();
  const mine = selected ? records.filter((r) => r.studentId === selected.id) : [];
  const [setuk, logs, service] = selected
    ? await Promise.all([loadStudentSetuk(selected), loadStudentLogs(selected.id), loadStudentService(selected.id)])
    : [[], [], []];
  const acts = activityItems(setuk, logs.slice(0, 20), [], names);
  const docs = activityItems([], [], service, names);
  const side = activityItems(setuk, logs, service, names).slice(0, 4);

  const notice = !selected ? "" : isAdmin(v)
    ? "관리자라 모든 선생님의 상담 기록이 보여요."
    : isHomeroomOf(v, selected)
      ? "우리 반 학생이라 다른 선생님이 쓴 기록도 보여요."
      : "내가 쓴 상담 기록만 보여요. 다른 선생님의 기록은 열람할 수 없어요.";
  const base = selected ? `/teacher/counseling?student=${selected.id}` : "/teacher/counseling";
  const now = today();

  return (
    <>
      <PageHeader title="담당 학생·상담" actions={
        selected && <ButtonLink href="#new-counsel" kind="outline" size="sm"><Plus size={16} /> 상담 기록 쓰기</ButtonLink>
      } />
      <PageBody>
        <StatTiles items={[
          ["담당 학생", `${stats.students}명`],
          ["이번 학기 상담", `${stats.semester}건`],
          ["이번 주", `${stats.week}건`],
          ["기록 없음", `${stats.none}명`],
        ]} />
        {selected ? (
          <AiAttach key={selected.id} title="상담 요약" line={`${selected.name} 학생 상담 ${mine.length}건을 요약하고 다음 주제를 정해요`}
            run={summarizeCounsel} studentId={selected.id} today={now} attachLabel="상담 기록에 붙이기" disabled={!mine.length} label={aiEnabled() ? "AI" : "자동"} />
        ) : null}

        <div className="grid gap-4 md:grid-cols-[280px_1fr] md:gap-6 xl:grid-cols-[280px_1fr_300px]">
          <div className={q.student ? "max-md:hidden" : undefined}>
          <StudentPicker
            selected={selected?.id ?? null}
            tab={tab}
            students={students.map((s) => ({
              id: s.id, name: s.name, label: `${makeStudentNo(s.grade, s.classNo, s.number)}`, classKey: `${s.grade}-${s.classNo}`, count: counts.get(s.id) ?? 0,
            }))}
          />
          </div>

          {selected ? (
            <Card className="min-w-0">
              {q.student && <Link href="/teacher/counseling" className="-mt-1 mb-3 flex items-center gap-1 text-[13px] text-sub md:hidden"><ChevronLeft size={16} /> 학생 목록</Link>}
              <div className="mb-4 flex items-center gap-3">
                <Avatar name={selected.name} size={48} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold">{selected.name}</h2>
                  <p className="text-[13px] text-mute">{selected.grade}학년 {selected.classNo}반 {selected.number}번{selected.careerGoal ? ` · ${selected.careerGoal}` : ""}</p>
                </div>
                {canViewStudentRecord(v, selected) && <ButtonLink href={`/homeroom/students/${selected.id}`} kind="outline" size="sm">전체 기록</ButtonLink>}
              </div>
              <TabLinks active={tab} items={[
                { key: "counsel", label: `상담 기록 ${mine.length}`, href: base },
                { key: "activity", label: `활동·초안 ${acts.length}`, href: `${base}&tab=activity` },
                { key: "docs", label: `제출 서류 ${docs.length}`, href: `${base}&tab=docs` },
              ]} />

              {tab === "counsel" && (
                <div className="mt-4 flex flex-col gap-4">
                  <p className="flex items-center gap-2 rounded-inner bg-white px-4 py-3 text-[13px] text-sub"><ShieldCheck size={16} className="shrink-0 text-mute" />{notice}</p>
                  <AiAttach key={`q-${selected.id}`} title="다음 상담 질문" tag="질문" listTopics topicsLabel="물어볼 질문"
                    line={mine.length ? "최근 상담 기록을 읽고 다음에 물어볼 질문 3개를 골라요" : "첫 상담에서 물어볼 질문 3개를 골라요"}
                    run={suggestCounselQuestions} studentId={selected.id} today={now} attachLabel="상담 기록 시작" runLabel="질문 추천" label={aiEnabled() && mine.length ? "AI" : "자동"} />
                  <div id="new-counsel" className="scroll-mt-6">
                    <CounselForm key={selected.id} studentId={selected.id} today={now} />
                  </div>
                  <CounselList studentId={selected.id} today={now} items={mine.map((r) => ({
                    id: r.id, date: r.date, area: r.area, content: r.content, author: names.get(r.authorId) ?? "교사",
                    mine: r.authorId === v.accountId, revised: !!r.prevId,
                  }))} />
                </div>
              )}
              {tab === "activity" && <div className="mt-4"><ActivityList items={acts} empty="아직 세특·누가기록이 없어요" /></div>}
              {tab === "docs" && <div className="mt-4"><ActivityList items={docs} empty="제출한 봉사 확인서가 없어요" /></div>}
            </Card>
          ) : (
            <Card>
              <div className="py-10 text-center">
                <p className="font-bold">담당 학생이 없어요</p>
                <p className="mt-1 text-sm text-sub">내 교과·과목에서 맡은 반을 정하면 학생이 보여요</p>
              </div>
            </Card>
          )}

          {selected && (
            <Card title="활동·초안" className="hidden md:col-span-2 md:block xl:col-span-1">
              <ActivityList items={side} empty="아직 기록이 없어요" compact />
            </Card>
          )}
        </div>
      </PageBody>
    </>
  );
}
