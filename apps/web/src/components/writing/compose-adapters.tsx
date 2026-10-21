"use client";
import type { ComponentProps } from "react";
import { MIN_RATIO, NEIS_MAX_BYTES, neisMax, resolveLength, type LengthUnit } from "@/lib/domain/length";
import { recordMax, resolveRecordLength, type RecordArea } from "@/lib/domain/writing";
import { libraryAreaOf } from "@/lib/domain/library";
import type { KeywordMenu } from "@/lib/domain/behavior-keywords";
import { fitSetuk, listSetukPieces, mergeSetuk, reviseSetuk, aiFixSetuk, variantsSetuk, tagSetuk, saveSetuk } from "@/app/(app)/teacher/setuk/actions";
import { fitRecordAction, listRecordPieces, mergeRecordAction, reviseRecordAction, aiFixRecordAction, variantsRecordAction, tagRecord, saveRecord } from "@/app/(app)/teacher/write/actions";
import { pieceFromLibrary } from "@/app/(app)/teacher/library/actions";
import { ComposeWorkspace, type ComposeAdapter } from "./compose-workspace";
import { KeywordMenuCard, type BehaviorLog } from "./keyword-menu";

// 글 짓기 영역별 연결 (Figma N52): 세특 · 기록(동아리 · 행발 · 자율·자치 · 진로)의 서버 동작을 ComposeAdapter 하나로 묶는다.
// 서버 동작(저장 · 모아 쓰기 + 게이트 + append · 맞추기 · 수정 요청 · 고치기 · 다른 버전 · 역량)은 옛 편집기와 같은 것을 그대로 부른다.

type Shared = Omit<ComponentProps<typeof ComposeWorkspace>, "adapter" | "shared" | "keywordBoard" | "word">;

/** 세특: 공통과목(2022 개정)은 다른 학기에 쓴 바이트만큼 이 학기 최대가 줄어든다 */
export function SetukCompose({ courseId, subject, shared, ...rest }: Shared & {
  courseId: string;
  subject: string;
  shared?: { other: 1 | 2; bytes: number };
}) {
  const studentId = rest.current;
  const cap = shared ? Math.max(0, NEIS_MAX_BYTES["세특"] - shared.bytes) : null;
  const capOf = (unit: LengthUnit, full: number) => (cap == null ? full : Math.min(full, unit === "bytes" ? cap : Math.floor(cap / 3)));
  const adapter: ComposeAdapter = {
    group: "setuk",
    pickScope: `setuk.${courseId}`,
    gateScope: "세특",
    guideArea: "세특",
    reviseKind: "record",
    spellKind: "setuk",
    libraryArea: "세특",
    subject,
    hidden: { courseId, studentId },
    save: saveSetuk,
    range: (len) => {
      const full = resolveLength("세특", len);
      const capMax = capOf(full.unit, full.max);
      return { ...full, max: capMax, min: Math.min(full.min, Math.ceil(capMax * MIN_RATIO)) };
    },
    limit: (unit) => capOf(unit, neisMax("세특", unit)),
    neisLimit: (unit) => neisMax("세특", unit),
    load: () => listSetukPieces({ courseId, studentId }),
    merge: (pieces, unit, max, tol, level, opts) => mergeSetuk({ courseId, studentId, pieces, unit, max, level, keepOrder: true, tol, append: opts?.append }),
    fit: (text, unit, max, tol) => fitSetuk({ courseId, studentId, text, unit, max, tol }),
    revise: (text, request, unit, max, tol) => reviseSetuk({ courseId, studentId, text, request, unit, max, tol }),
    aiFix: (text, unit, max, praise) => aiFixSetuk({ courseId, studentId, text, unit, max, praise }),
    variants: (text, mode, unit, max) => variantsSetuk({ courseId, studentId, text, mode, unit, max }),
    tag: (text, force) => tagSetuk({ courseId, studentId, text, force }),
    addLibraryPiece: async (id) => pieceFromLibrary({ id, target: { kind: "setuk", courseId, studentId } }),
  };
  const capMax = capOf("bytes", NEIS_MAX_BYTES["세특"]);
  return <ComposeWorkspace {...rest} adapter={adapter} word="세특 글" shared={shared ? { ...shared, capMax } : undefined} />;
}

const WORD: Record<RecordArea, string> = { 동아리: "동아리 글", 행발: "행발 글", "자율·자치": "자율·자치 글", 진로: "진로 글" };

/** 동아리 · 담임(행발 · 자율·자치 · 진로): 조각 = 누가기록 + 관찰 메모 (listRecordPieces) */
export function RecordCompose({ area, clubId, behavior, ...rest }: Omit<Shared, "similar"> & {
  area: RecordArea;
  clubId?: string;
  /** 행발 키워드 메뉴판 (N35 ④) */
  behavior?: { menu: KeywordMenu; pick: { keywords: string[]; memo: string; useLogs: boolean }; logs: BehaviorLog[] };
}) {
  const studentId = rest.current;
  const adapter: ComposeAdapter = {
    group: area === "동아리" ? "club" : "homeroom",
    pickScope: area === "동아리" ? `club.${clubId ?? ""}` : `homeroom.${area}`,
    gateScope: area,
    guideArea: area,
    reviseKind: area === "행발" ? "behavior" : "record",
    spellKind: "record",
    libraryArea: libraryAreaOf(area),
    hidden: { area, studentId, ...(clubId ? { clubId } : {}) },
    save: saveRecord,
    range: (len) => resolveRecordLength(area, len),
    limit: (unit) => recordMax(area, unit),
    neisLimit: (unit) => recordMax(area, unit),
    load: () => listRecordPieces({ area, studentId, clubId }),
    merge: (pieces, unit, max, tol, _level, opts) => mergeRecordAction({ area, studentId, clubId, pieces, unit, max, keepOrder: true, tol, append: opts?.append }),
    fit: (text, unit, max, tol) => fitRecordAction({ area, studentId, clubId, text, unit, max, tol }),
    revise: (text, request, unit, max, tol) => reviseRecordAction({ area, studentId, clubId, text, request, unit, max, tol }),
    aiFix: (text, unit, max, praise) => aiFixRecordAction({ area, studentId, clubId, text, unit, max, praise: { evidence: praise.evidence } }),
    variants: (text, mode, unit, max) => variantsRecordAction({ area, studentId, clubId, text, mode, unit, max }),
    tag: (text, force) => tagRecord({ area, studentId, clubId, text, force }),
    addLibraryPiece: async (id) => pieceFromLibrary({ id, target: { kind: "record", area, studentId, clubId } }),
  };
  const keywordBoard = behavior
    ? ({ onApply, bodyEmpty }: { onApply: Parameters<typeof KeywordMenuCard>[0]["onApply"]; bodyEmpty: boolean }) => (
      <KeywordMenuCard studentId={studentId} menu={behavior.menu} pick={behavior.pick} logs={behavior.logs} unit={rest.unit} neisMax={recordMax("행발", rest.unit)}
        bodyEmpty={bodyEmpty} onApply={onApply} aiOn={rest.aiOn} />
    )
    : undefined;
  return <ComposeWorkspace {...rest} adapter={adapter} word={WORD[area]} keywordBoard={keywordBoard} />;
}
