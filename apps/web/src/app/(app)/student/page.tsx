import { BookOpen, ClipboardList, Moon, Upload } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { SampleTag } from "@/components/sample";
import { AiBanner, ButtonLink, Card, Row, StatTiles, Tag } from "@/components/ui";
import { requireViewer } from "@/lib/server/viewer";
import { redirect } from "next/navigation";

export const metadata = { title: "홈 · 속초고등학교 학생관리시스템" };

const tile = (Icon: typeof BookOpen) => (
  <span className="flex size-11 shrink-0 items-center justify-center rounded-field bg-white"><Icon size={22} /></span>
);

export default async function StudentHome() {
  const v = await requireViewer();
  if (v.kind !== "student") redirect("/");
  const s = v.student;
  return (
    <>
      <PageHeader title={`안녕하세요, ${s.name} 학생`} actions={<ButtonLink href="/student/record" kind="outline" size="sm">내 생활기록부</ButtonLink>} />
      <PageBody>
        <StatTiles items={[["제출할 설문", "1개"], ["제출할 서류", "1개"], ["10월 모의 평균", "2.3등급"], ["이번 주 야자", "3일"]]} />
        <AiBanner title="할 일 정리" line={'설문 3번 "느낀 점"만 남았어요 · 약 3분'} action={<span className="hidden md:block"><SampleTag /></span>} />
        <div className="grid gap-4 md:grid-cols-[1fr_340px] md:gap-6">
          <Card title="오늘 할 일" action={<SampleTag />}>
            <div className="flex flex-col gap-2">
              {[
                [ClipboardList, "과학 탐구 발표 활동 설문", "5문항 · 10.20 마감", "D-4"],
                [Upload, "탐구 보고서 제출", "PDF·사진 · 10.20 마감", "D-4"],
                [Moon, "다음 주 야자 신청", "10.19 ~ 10.23", ""],
              ].map(([I, t, m, d]) => (
                <div key={t as string} className="flex items-center gap-3.5 rounded-inner bg-white p-4">
                  {tile(I as typeof BookOpen)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-bold">{t as string}{d ? <Tag>{d as string}</Tag> : null}</div>
                    <div className="text-[13px] text-mute">{m as string}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="내 정보">
            <Row title="학번" right={<span className="text-sm font-medium">{s.studentNo}</span>} />
            <Row title="반" right={<span className="text-sm font-medium">{s.grade}학년 {s.classNo}반 {s.number}번</span>} />
            <Row last title="희망 진로" right={<span className="text-sm font-medium">{s.careerGoal ?? "아직 없어요"}</span>} />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
