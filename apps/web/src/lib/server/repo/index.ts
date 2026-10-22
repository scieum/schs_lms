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
import { demoAssessments, supabaseAssessments, type AssessmentsRepo } from "./modules/assessments";
import { demoWritingStyles, supabaseWritingStyles, type WritingStylesRepo } from "./modules/writing-styles";
import { demoTips, supabaseTips, type TipsRepo } from "./modules/tips";
import { demoQna, supabaseQna, type QnaRepo } from "./modules/qna";
import { demoPrompts, supabasePrompts, type PromptsRepo } from "./modules/prompts";
import { demoCompetencyCache, supabaseCompetencyCache, type CompetencyCacheRepo } from "./modules/competency-cache";
import { demoCommon, supabaseCommon, type CommonRepo } from "./modules/common";
import { demoLibrary, supabaseLibrary, type LibraryRepo } from "./modules/library";
import { demoLevels, supabaseLevels, type LevelsRepo } from "./modules/levels";
import { demoKeywords, supabaseKeywords, type KeywordsRepo } from "./modules/keywords";
import { demoRetention, supabaseRetention, type RetentionRepo } from "./modules/retention";
import { demoProvenance, supabaseProvenance, type ProvenanceRepo } from "./modules/provenance";
import { demoClassWrite, supabaseClassWrite, type ClassWriteRepo } from "./modules/class-write";
import { demoLessons, supabaseLessons, type LessonsRepo } from "./modules/lessons";

// 기능별 모듈을 하나의 repo 로 합친다. 메서드 이름은 모듈끼리 겹치지 않게 짓는다.
export type FullRepo = Repo & ProgramsRepo & ScoresRepo & CounselRepo & AdminRepo & WritingRepo & RostersRepo & EventsRepo & PrefsRepo & CommonRepo & LibraryRepo & LevelsRepo & KeywordsRepo & RetentionRepo & ProvenanceRepo & ClassWriteRepo & LessonsRepo & CompetencyCacheRepo & TipsRepo & QnaRepo & PromptsRepo & WritingStylesRepo & AssessmentsRepo;

export const repo: FullRepo = isDemo
  ? { ...demoRepo, ...demoPrograms, ...demoScores, ...demoCounsel, ...demoAdmin, ...demoWriting, ...demoRosters, ...demoEvents, ...demoPrefs, ...demoCommon, ...demoLibrary, ...demoLevels, ...demoKeywords, ...demoRetention, ...demoProvenance, ...demoClassWrite, ...demoLessons, ...demoCompetencyCache, ...demoTips, ...demoQna, ...demoPrompts, ...demoWritingStyles, ...demoAssessments }
  : { ...supabaseRepo, ...supabasePrograms, ...supabaseScores, ...supabaseCounsel, ...supabaseAdmin, ...supabaseWriting, ...supabaseRosters, ...supabaseEvents, ...supabasePrefs, ...supabaseCommon, ...supabaseLibrary, ...supabaseLevels, ...supabaseKeywords, ...supabaseRetention, ...supabaseProvenance, ...supabaseClassWrite, ...supabaseLessons, ...supabaseCompetencyCache, ...supabaseTips, ...supabaseQna, ...supabasePrompts, ...supabaseWritingStyles, ...supabaseAssessments };
export type { Repo, NewStudent } from "./types";
