import "server-only";
import { isDemo } from "../env";
import { demoRepo } from "./demo";
import { supabaseRepo } from "./supabase";

export const repo = isDemo ? demoRepo : supabaseRepo;
export type { Repo, NewStudent } from "./types";
