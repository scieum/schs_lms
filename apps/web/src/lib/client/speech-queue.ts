// 발표 녹음 줄 (Figma N73, 2026-10-25 "한 분이 3개 반 5분씩"): 멈추면 바로 다음 발표를 녹음할 수 있게, 받아쓰기는 줄을 세워 차례로 한다.
// 이 탭의 메모리에만 둔다(반 탭 · 화면을 옮겨도 남고, 새로 고치거나 닫으면 사라진다 — 그 전에 묻는다). 녹음 소리는 받아쓴 뒤 버린다.
import { decode16k, transcribe } from "./speech";
import { cleanTranscript } from "@/lib/domain/transcript";

export type Take = {
  id: number;
  /** "녹음 3" */
  label: string;
  /** 녹음을 멈춘 시각 "10:42" */
  at: string;
  sec: number;
  status: "wait" | "run" | "done" | "error";
  stage: "load" | "run";
  ratio: number;
  text: string;
  error?: string;
  /** 메모 칸에 넣었는지 */
  used?: boolean;
};

let takes: Take[] = [];
let seq = 0;
let running = false;
const blobs = new Map<number, Blob>();
const listeners = new Set<() => void>();
const emit = () => { takes = [...takes]; listeners.forEach((f) => f()); };
const patch = (id: number, p: Partial<Take>) => { takes = takes.map((t) => (t.id === id ? { ...t, ...p } : t)); listeners.forEach((f) => f()); };

export const subscribeTakes = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const getTakes = () => takes;
const EMPTY: Take[] = [];
export const getServerTakes = () => EMPTY;

/** 아직 메모 칸에 넣지 않은 받아쓰기가 있으면 새로 고침 · 닫기 전에 묻는다 */
let guarded = false;
function guard() {
  if (guarded || typeof window === "undefined") return;
  guarded = true;
  window.addEventListener("beforeunload", (e) => {
    if (takes.some((t) => t.status !== "error" && !t.used)) { e.preventDefault(); e.returnValue = ""; }
  });
}

export function addTake(blob: Blob, sec: number) {
  guard();
  const id = ++seq;
  blobs.set(id, blob);
  const at = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  takes = [{ id, label: `녹음 ${id}`, at, sec, status: "wait", stage: "run", ratio: 0, text: "" }, ...takes];
  emit();
  void pump();
}

async function pump() {
  if (running) return;
  const next = [...takes].reverse().find((t) => t.status === "wait");
  if (!next) return;
  running = true;
  patch(next.id, { status: "run" });
  try {
    const audio = await decode16k(blobs.get(next.id)!);
    blobs.delete(next.id);
    const text = cleanTranscript(await transcribe(audio, (p) => patch(next.id, { stage: p.stage, ratio: p.ratio })));
    patch(next.id, text.trim() ? { status: "done", text } : { status: "error", error: "말소리를 찾지 못했어요. 마이크 가까이에서 다시 녹음해 주세요" });
  } catch (e) {
    blobs.delete(next.id);
    patch(next.id, { status: "error", error: e instanceof Error ? e.message : "받아쓰지 못했어요" });
  } finally {
    running = false;
    void pump();
  }
}

export const editTake = (id: number, text: string) => patch(id, { text });
export const markUsed = (id: number) => patch(id, { used: true });
export function removeTake(id: number) { blobs.delete(id); takes = takes.filter((t) => t.id !== id); emit(); }
