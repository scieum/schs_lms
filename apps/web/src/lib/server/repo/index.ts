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
import { demoRosters, supabaseRosters, type RostersRepo } from "./modules/rosters";
import { demoEvents, supabaseEvents, type EventsRepo } from "./modules/events";
import { demoPrefs, supabasePrefs, type PrefsRepo } from "./modules/prefs";
import { demoCommon, supabaseCommon, type CommonRepo } from "./modules/common";
import { demoLibrary, supabaseLibrary, type LibraryRepo } from "./modules/library";
import { demoLevels, supabaseLevels, type LevelsRepo } from "./modules/levels";
import { demoKeywords, supabaseKeywords, type KeywordsRepo } from "./modules/keywords";

// 기능별 모듈을 하나의 repo 로 합친다. 메서드 이름은 모듈끼리 겹치지 않게 짓는다.
export type FullRepo = Repo & ProgramsRepo & ScoresRepo & CounselRepo & AdminRepo & WritingRepo & RostersRepo & EventsRepo & PrefsRepo & CommonRepo & LibraryRepo & LevelsRepo & KeywordsRepo;

export const repo: FullRepo = isDemo
  ? { ...demoRepo, ...demoPrograms, ...demoScores, ...demoCounsel, ...demoAdmin, ...demoWriting, ...demoRosters, ...demoEvents, ...demoPrefs, ...demoCommon, ...demoLibrary, ...demoLevels, ...demoKeywords }
  : { ...supabaseRepo, ...supabasePrograms, ...supabaseScores, ...supabaseCounsel, ...supabaseAdmin, ...supabaseWriting, ...supabaseRosters, ...supabaseEvents, ...supabasePrefs, ...supabaseCommon, ...supabaseLibrary, ...supabaseLevels, ...supabaseKeywords };
export type { Repo, NewStudent } from "./types";
