"use client";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Link2, Search, ShieldCheck, X } from "lucide-react";
import { ALL_FEATURES } from "../landing-data";
import { New } from "../landing-sections";
import { FEATURE_GUIDE, type FeatureGuide } from "./feature-guide";

/* ---------- 기능 한눈에 보기 /features — 기능마다 설명 (N45, Figma 04 상세페이지 · docs/design-system.md N45 절) ----------
   목록을 먼저 훑고, 궁금한 줄만 그 자리에서 펼쳐 읽는다(줄 펼침 · 여러 개 열 수 있음). 61개라 모달·옆 패널 대신 줄 펼침.
   위: 찾기(이름·한 줄·설명 전체에서) + 영역 탭(붙어 따라옴). 영역은 PC·모바일 모두 펼친 채 둔다(N44 모바일 영역 아코디언 → 줄 아코디언 한 겹).
   주소: /features#<id> 로 오면 그 기능을 열고 그 자리로 간다. 펼치면 주소도 그 기능으로 바뀐다(링크 복사).
   유아이볼: 코빗·사방넷 FAQ 펼침 · 쿠팡 고객센터 찾기 · 골프존 FAQ 찾기+칩 · 국가유산 이용가이드 · 폴센트 FAQ 시트 · Google 애드센스 도움말 */

type Item = { name: string; line: string; who: string; isNew: boolean; g: FeatureGuide };
const AREAS: { area: string; items: Item[] }[] = ALL_FEATURES.map(({ area, rows }) => ({
  area,
  items: rows.map(([name, line, who, isNew]) => ({ name, line, who, isNew: !!isNew, g: FEATURE_GUIDE[name] })),
}));

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const haystack = (it: Item) => norm([it.name, it.line, it.who, it.g.what, it.g.why, ...it.g.steps, ...it.g.where, ...(it.g.safe ?? [])].join(" "));

function Who({ children }: { children: string }) {
  return <span className="shrink-0 whitespace-nowrap rounded-chip bg-soft px-2 py-[3px] text-[12px] font-medium text-sub md:text-[13px]">{children}</span>;
}

function Detail({ it }: { it: Item }) {
  const { g } = it;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/features#${g.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* 복사 못 하면 주소창 그대로 */ }
  };
  return (
    <div className={`grid gap-5 rounded-inner bg-bg p-4 md:gap-8 md:p-7 ${g.img ? "md:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
      <div className="min-w-0">
        <p className="text-[15px] leading-[1.6] text-ink md:text-[16px]">{g.what}</p>
        <p className="mt-3 text-[14px] leading-[1.6] text-sub md:text-[15px]"><span className="mr-1.5 font-bold text-key-strong">이럴 때 좋아요</span>{g.why}</p>
        <h4 className="mt-5 text-[13px] font-bold text-mute md:text-[14px]">이렇게 써요</h4>
        <ol className="mt-2 flex flex-col gap-2">
          {g.steps.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-[1.55] text-ink md:text-[15px]">
              <span aria-hidden className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full bg-key text-[12px] font-bold text-white">{i + 1}</span>
              <span className="min-w-0">{s}</span>
            </li>
          ))}
        </ol>
        <dl className="mt-5 flex flex-col gap-2.5 text-[13px] md:text-[14px]">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <dt className="w-10 shrink-0 font-bold text-mute">어디서</dt>
            <dd className="min-w-0 rounded-field border border-line bg-white px-2.5 py-1 font-medium leading-[1.5] text-ink">{g.where.join(" › ")}</dd>
          </div>
          <div className="flex items-center gap-2.5">
            <dt className="w-10 shrink-0 font-bold text-mute">누가</dt>
            <dd><Who>{it.who}</Who></dd>
          </div>
        </dl>
        {g.safe && (
          <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4">
            {g.safe.map((s) => (
              <li key={s} className="flex gap-2 text-[13px] leading-[1.55] text-sub md:text-[14px]">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-key" aria-hidden />{s}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={copy} className="mt-4 -ml-2.5 inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[13px] font-medium text-sub hover:bg-white hover:text-ink">
          {copied ? <Check size={16} className="text-ok" aria-hidden /> : <Link2 size={16} aria-hidden />}
          {copied ? "링크를 복사했어요" : "링크 복사"}
        </button>
      </div>
      {g.img && (
        <div className="overflow-hidden rounded-inner bg-key-soft md:self-start">
          <Image src={`/landing/n65/${g.img}.png`} alt={`${it.name} 화면`} width={1200} height={800} sizes="(min-width: 768px) 320px, 100vw" className="h-auto w-full" />
        </div>
      )}
    </div>
  );
}

function Row({ it, open, toggle }: { it: Item; open: boolean; toggle: () => void }) {
  const { id } = it.g;
  return (
    <li id={id} className="scroll-mt-[150px] border-b border-line md:scroll-mt-[160px]">
      <h3>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={`${id}-panel`} id={`${id}-btn`}
          className="group flex w-full items-start gap-2 py-3 text-left md:items-center md:gap-3 md:px-1 md:py-[15px]">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
            <span className="flex items-center gap-1.5 md:w-[230px] md:shrink-0">
              <span className="text-[15px] font-bold leading-[1.4] group-hover:text-key-strong md:text-[16px]">{it.name}</span>
              {it.isNew && <New />}
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-normal leading-[1.4] text-sub md:text-[15px]">{it.line}</span>
          </span>
          <Who>{it.who}</Who>
          <ChevronDown size={20} aria-hidden className={`mt-px shrink-0 text-mute transition-transform md:mt-0 ${open ? "rotate-180" : ""}`} />
        </button>
      </h3>
      {open && (
        <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} className="pb-4 md:pb-5">
          <Detail it={it} />
        </div>
      )}
    </li>
  );
}

export function FeatureList() {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState("");

  // 주소 #<id> 로 오면 그 기능을 열고 그 자리로
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!AREAS.some((a) => a.items.some((it) => it.g.id === id))) return;
      setQ("");
      setOpen((s) => new Set(s).add(id));
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    go();
    addEventListener("hashchange", go);
    return () => removeEventListener("hashchange", go);
  }, []);

  const toggle = (id: string) => {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else {
        n.add(id);
        history.replaceState(null, "", `#${id}`);
      }
      return n;
    });
  };

  const areas = useMemo(() => {
    const k = norm(q);
    if (!k) return AREAS;
    return AREAS.map((a) => ({ ...a, items: a.items.filter((it) => haystack(it).includes(k)) })).filter((a) => a.items.length);
  }, [q]);
  const found = areas.reduce((n, a) => n + a.items.length, 0);

  const goArea = (i: number) => document.getElementById(`area-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="mx-auto max-w-[960px]">
      {/* 찾기 */}
      <div className="mt-8 md:mt-10">
        <label className="relative mx-auto flex h-11 w-full items-center gap-2 rounded-inner border border-line bg-white px-3.5 focus-within:border-key md:h-12 md:max-w-[480px]">
          <Search size={18} className="shrink-0 text-mute" aria-hidden />
          <span className="sr-only">기능 찾기</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="기능 이름이나 하고 싶은 일로 찾기"
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mute [&::-webkit-search-cancel-button]:hidden" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="찾기 지우기" className="shrink-0 rounded-full p-1 text-mute hover:bg-soft hover:text-ink">
              <X size={16} aria-hidden />
            </button>
          )}
        </label>
        <p aria-live="polite" className="mt-2 min-h-[20px] text-[13px] text-sub md:text-center md:text-[14px]">
          {q ? (found ? <>‘{q}’ 기능 <b className="text-key-strong">{found}</b>개</> : "") : "줄을 누르면 무엇인지, 어떻게 쓰는지 펼쳐 보여요."}
        </p>
      </div>

      {/* 영역 탭: 메뉴 아래 붙어 따라온다. 모바일은 가로로 밀어 본다 */}
      {!q && (
        <nav aria-label="영역" className="sticky top-14 z-20 -mx-5 mt-2 bg-white/95 px-5 py-3 backdrop-blur md:top-[79px] md:mx-0 md:px-0">
          <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] md:flex-wrap md:justify-center md:gap-2">
            {AREAS.map((a, i) => (
              <li key={a.area} className="shrink-0">
                <button type="button" onClick={() => goArea(i)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-control bg-bg px-3 py-2 text-[14px] font-bold text-sub hover:text-ink md:px-4 md:text-[15px]">
                  {a.area}<span className="text-key">{a.items.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {q && !found ? (
        <div className="mt-6 rounded-card bg-bg px-5 py-10 text-center">
          <p className="text-[15px] font-bold">찾는 기능이 없어요</p>
          <p className="mt-1 text-[14px] text-sub">다른 말로 찾아보세요. 예: 나이스, 메모, 봉사</p>
          <button type="button" onClick={() => setQ("")} className="mt-4 rounded-control bg-white px-4 py-2 text-[14px] font-bold text-sub hover:text-ink">전체 보기</button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-10 md:mt-6 md:gap-14">
          {areas.map((a) => {
            const i = AREAS.findIndex((x) => x.area === a.area);
            return (
              <section key={a.area} id={`area-${i}`} aria-labelledby={`area-${i}-h`} className="scroll-mt-[120px] md:scroll-mt-[150px]">
                <h2 id={`area-${i}-h`} className="flex items-baseline gap-2.5 border-b-2 border-ink pb-3 text-left md:pb-3.5">
                  <span className="text-[20px] font-bold leading-[1.35] md:text-[22px]">{a.area}</span>
                  <span className="text-[15px] font-bold text-key md:text-[16px]">{a.items.length}</span>
                </h2>
                <ul>
                  {a.items.map((it) => <Row key={it.g.id} it={it} open={open.has(it.g.id)} toggle={() => toggle(it.g.id)} />)}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
