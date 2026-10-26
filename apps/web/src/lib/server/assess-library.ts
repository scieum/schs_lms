import "server-only";
import g1 from "@/lib/domain/assess-library/2026-2-g1.json";
import g2 from "@/lib/domain/assess-library/2026-2-g2.json";
import { libraryFor, type LibEntry, type LibPlan } from "@/lib/domain/assess-library";

// 학교 평가계획서 라이브러리 (N78): 계획서를 학년마다 JSON 하나로 옮겨 여기 더한다. 화면에는 고른 과목 것만 보낸다(전체는 서버에만).
export const PLANS: LibPlan[] = [g1 as LibPlan, g2 as LibPlan];

export const libraryEntries = (course: { subject: string; year: number; grade: number; semester: number }): LibEntry[] => libraryFor(PLANS, course);
