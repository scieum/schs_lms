"use client";
import { useRouter } from "next/navigation";

// 관리자용: 어느 선생님의 교과·과목을 정할지 고른다
export function TeacherPicker({ teachers, value }: { teachers: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-3 rounded-inner bg-soft px-4 py-3">
      <span className="shrink-0 text-[13px] font-medium text-sub">선생님</span>
      <select
        value={value}
        onChange={(e) => router.push(`/teacher/subjects?teacher=${e.target.value}`)}
        className="h-10 flex-1 rounded-field bg-white px-3 text-[15px] outline-none focus:ring-2 focus:ring-key"
      >
        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}
