import { CommonActivityDetail } from "@/components/writing/common-activity-detail";

export const metadata = { title: "공통 활동 · 속초고 쌤기부" };

type Props = { params: Promise<{ id: string }> };

/** 교과 세특 공통 활동 (Figma N26) */
export default async function SetukActivityPage({ params }: Props) {
  const { id } = await params;
  return <CommonActivityDetail id={id} want="세특" />;
}
