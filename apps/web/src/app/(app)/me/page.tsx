import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { Avatar, Button, Card, Row } from "@/components/ui";
import { roleLabel } from "@/lib/domain/policy";
import { aiEnabled } from "@/lib/server/ai/claude";
import { requireViewer } from "@/lib/server/viewer";
import { CareerForm, PasswordForm } from "./forms";

export const metadata = { title: "내 정보 · 속초고등학교 학생관리시스템" };

/** 내 정보 (학생·교사 공통): 이름·역할, 희망 진로(학생), 비밀번호, 로그아웃 */
export default async function MePage() {
  const v = await requireViewer();
  const name = v.kind === "student" ? v.student.name : `${v.teacher.name} 선생님`;

  return (
    <>
      <PageHeader title="내 정보" />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          <div className="flex flex-col gap-4 md:gap-6">
            <Card>
              <div className="flex items-center gap-3.5">
                <Avatar name={name} size={52} />
                <div className="min-w-0">
                  <div className="truncate text-lg font-bold">{name}</div>
                  <div className="truncate text-[13px] text-mute">{roleLabel(v)}</div>
                </div>
              </div>
              <div className="mt-4">
                {v.kind === "student" ? (
                  <>
                    <Row title="학번" right={<span className="text-sm font-medium">{v.student.studentNo}</span>} />
                    <Row last title="희망 진로" right={<span className="text-sm font-medium">{v.student.careerGoal ?? "아직 없어요"}</span>} />
                  </>
                ) : (
                  <>
                    <Row title="부서" right={<span className="text-sm font-medium">{v.teacher.dept ?? "—"}</span>} />
                    <Row last title="담임" right={<span className="text-sm font-medium">{v.teacher.homeroom ? `${v.teacher.homeroom.grade}학년 ${v.teacher.homeroom.classNo}반` : "—"}</span>} />
                  </>
                )}
              </div>
            </Card>
            {v.kind === "student" && (
              <Card title="희망 진로">
                <p className="mb-3 text-[13px] text-sub">추천 활동이 이 진로를 기준으로 바뀌어요</p>
                <CareerForm current={v.student.careerGoal} assist aiOn={aiEnabled()} />
              </Card>
            )}
            <form action={logout}>
              <Button kind="outline" className="w-full"><LogOut size={18} /> 로그아웃</Button>
            </form>
          </div>
          <Card title="비밀번호 바꾸기" className="h-full">
            <PasswordForm />
          </Card>
        </div>
      </PageBody>
    </>
  );
}
