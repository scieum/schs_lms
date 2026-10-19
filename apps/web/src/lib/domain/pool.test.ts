import { describe, expect, it } from "vitest";
import { runPool, withTimeout } from "./pool";

const defer = () => {
  let resolve!: (v: number) => void;
  const p = new Promise<number>((r) => { resolve = r; });
  return { p, resolve };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("동시 n 풀 (N42)", () => {
  it("동시 3개까지만, 끝나는 대로 다음 (결과는 넣은 순서)", async () => {
    const d = Array.from({ length: 5 }, defer);
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const done = runPool([0, 1, 2, 3, 4], 3, async (i) => {
      active++; peak = Math.max(peak, active); started.push(i);
      const v = await d[i].p;
      active--;
      return v;
    });
    await tick();
    expect(started).toEqual([0, 1, 2]);
    d[1].resolve(10);
    await tick(); await tick();
    expect(started).toEqual([0, 1, 2, 3]);
    d[0].resolve(0); d[2].resolve(20); d[3].resolve(30);
    await tick(); await tick();
    d[4].resolve(40);
    expect(await done).toEqual([0, 10, 20, 30, 40]);
    expect(peak).toBe(3);
  });

  it("멈추면 새 요청은 시작하지 않는다 (안 돈 것은 undefined)", async () => {
    const ctrl = new AbortController();
    const out = await runPool([1, 2, 3, 4], 1, async (x) => { if (x === 2) ctrl.abort(); return x * 2; }, { signal: ctrl.signal });
    expect(out).toEqual([2, 4, undefined, undefined]);
  });

  it("오류는 onError 로, 나머지는 계속", async () => {
    const errs: number[] = [];
    const out = await runPool([1, 2, 3], 2, async (x) => { if (x === 2) throw new Error("x"); return x; }, { onError: (x) => errs.push(x) });
    expect(out).toEqual([1, undefined, 3]);
    expect(errs).toEqual([2]);
  });

  it("429 → 쉬었다가 동시 수를 낮춘다", async () => {
    const sleeps: number[] = [];
    let active = 0;
    let peakAfter = 0;
    let throttled = false;
    const out = await runPool([1, 2, 3, 4, 5, 6], 3, async (x) => {
      active++;
      // 이미 돌던 요청은 끝까지 기다리므로, 쉰 뒤에 새로 시작한 뒤쪽 학생에서 동시 수를 본다
      if (throttled && x >= 5) peakAfter = Math.max(peakAfter, active);
      await tick();
      active--;
      return x === 1 ? "busy" : "ok";
    }, { backoff: (r) => (r === "busy" ? 5000 : null), sleep: async (ms) => { sleeps.push(ms); throttled = true; await tick(); await tick(); } });
    expect(out.filter(Boolean)).toHaveLength(6);
    expect(sleeps).toEqual([5000]);
    expect(peakAfter).toBeLessThanOrEqual(2);
  });

  it("시간 제한: 넘으면 대신 값", async () => {
    expect(await withTimeout(new Promise<string>(() => undefined), 5, () => "late")).toBe("late");
    expect(await withTimeout(Promise.resolve("ok"), 50, () => "late")).toBe("ok");
  });
});
