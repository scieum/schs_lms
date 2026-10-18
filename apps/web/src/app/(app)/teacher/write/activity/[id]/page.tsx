import { CommonActivityDetail } from "@/components/writing/common-activity-detail";

export const metadata = { title: "공통 활동 · 속초고등학교 학생관리시스템" };

type Props = { params: Promise<{ id: string }> };

/** 창체(자율·자치·동아리·진로)·행발 공통 활동 (Figma N26) */
export default async function RecordActivityPage({ params }: Props) {
  const { id } = await params;
  return <CommonActivityDetail id={id} want="기록" />;
}
