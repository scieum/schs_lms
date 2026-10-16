import "server-only";
import { isDemo } from "../env";
import { demoRepo } from "./demo";
import { supabaseRepo } from "./supabase";
import type { Repo } from "./types";
import { demoPrograms, supabasePrograms, type ProgramsRepo } from "./modules/programs";
import { demoScores, supabaseScores, type ScoresRepo } from "./modules/scores";
import { demoCounsel, supabaseCounsel, type CounselRepo } from "./modules/counsel";
import { demoAdmin, supabaseAdmin, type AdminRepo } from "./modules/admin";
import { demoWriting, supabaseWriting, type WritingRepo } from "./modules/writing";

// 기능별 모듈을 하나의 repo 로 합친다. 메서드 이름은 모듈끼리 겹치지 않게 짓는다.
export type FullRepo = Repo & ProgramsRepo & ScoresRepo & CounselRepo & AdminRepo & WritingRepo;

export const repo: FullRepo = isDemo
  ? { ...demoRepo, ...demoPrograms, ...demoScores, ...demoCounsel, ...demoAdmin, ...demoWriting }
  : { ...supabaseRepo, ...supabasePrograms, ...supabaseScores, ...supabaseCounsel, ...supabaseAdmin, ...supabaseWriting };
export type { Repo, NewStudent } from "./types";
