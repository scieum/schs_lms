// 동시 n개 풀 (Figma N42 ①): 학생 한 명 = 요청 하나. 끝나는 대로 다음 학생을 부른다(고정 묶음이 아님).
// 순수 함수 — 화면(반 전체 글 쓰기 · 반 전체 AI 고치기)이 같이 쓴다. 테스트: pool.test.ts

export type PoolOptions<T, R> = {
  /** 멈추기: 이미 시작한 요청은 기다리고, 새 요청은 시작하지 않는다 */
  signal?: AbortSignal;
  onStart?: (item: T, i: number) => void;
  onDone?: (item: T, result: R, i: number) => void;
  /** fn 이 던진 오류 (결과는 undefined) */
  onError?: (item: T, error: unknown, i: number) => void;
  /** 결과를 보고 쉬어야 하면 ms (예: 429 → 5초). 쉬는 동안 새 요청을 시작하지 않고, 동시 수를 하나 낮춘다(최소 1) */
  backoff?: (result: R) => number | null | undefined;
  /** 테스트용 */
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** items 를 동시 concurrency 개씩 fn 으로 돌린다. 결과는 items 순서 그대로 (멈춰서 안 돈 것은 undefined) */
export async function runPool<T, R>(items: readonly T[], concurrency: number, fn: (item: T, i: number) => Promise<R>, opts: PoolOptions<T, R> = {}): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length).fill(undefined);
  const sleep = opts.sleep ?? wait;
  let next = 0;
  let limit = Math.max(1, Math.floor(concurrency));
  let pause: Promise<void> | null = null;

  const worker = async (k: number) => {
    while (next < items.length) {
      if (pause) await pause;
      // 동시 수를 낮췄으면 넘치는 일꾼은 쉰다
      if (k >= limit || opts.signal?.aborted || next >= items.length) return;
      const i = next++;
      const item = items[i];
      opts.onStart?.(item, i);
      try {
        const r = await fn(item, i);
        out[i] = r;
        opts.onDone?.(item, r, i);
        const ms = opts.backoff?.(r);
        if (ms && ms > 0) {
          limit = Math.max(1, Math.min(limit, Math.max(1, Math.floor(concurrency) - 1)));
          if (!pause) pause = sleep(ms).then(() => { pause = null; });
        }
      } catch (e) {
        opts.onError?.(item, e, i);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, (_, k) => worker(k)));
  return out;
}

/** 시간 제한: ms 안에 끝나지 않으면 onTimeout 값 (뒤에 오는 답은 버린다) */
export function withTimeout<R>(p: Promise<R>, ms: number, onTimeout: () => R): Promise<R> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<R>((res) => { t = setTimeout(() => res(onTimeout()), ms); })]).finally(() => { if (t) clearTimeout(t); });
}
