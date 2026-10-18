// 성취기준 매핑 (2022 개정 교육과정 고등학교): 세특을 쓸 때 그 과목의 성취기준·내용 요소 가운데
// 학생 활동(메모·조각·자료 요약)과 겹치는 것만 골라 AI에 함께 준다. 데이터는 lib/data/standards-2022-high.json
// (교육부 고시 제2022-33호 각론에서 성취기준 문장과 내용 요소만 옮긴 것).

export type StandardItem = { code: string; text: string };
export type SubjectStandards = {
  group: string;
  units: { name: string; standards: StandardItem[]; elements: string[] }[];
  elements: string[];
};

const norm = (s: string) => s.replace(/\s|[()·ㆍ]/g, "").replace(/Ⅰ/g, "1").replace(/Ⅱ/g, "2").replace(/Ⅲ/g, "3").toLowerCase();

/** 과목 이름으로 찾기: 같은 이름 → 띄어쓰기·로마 숫자 무시 → 앞부분이 같은 이름 (예: "물리학 2분반" → 물리학) */
export function findSubject(all: Record<string, SubjectStandards>, name: string): [string, SubjectStandards] | null {
  if (all[name]) return [name, all[name]];
  const n = norm(name);
  const keys = Object.keys(all);
  const same = keys.find((k) => norm(k) === n);
  if (same) return [same, all[same]];
  const prefix = keys.filter((k) => n.startsWith(norm(k))).sort((a, b) => b.length - a.length)[0];
  return prefix ? [prefix, all[prefix]] : null;
}

// 낱말 비교: 2글자 이상 한글·영문 낱말의 앞 3글자 (조사가 붙어도 같게 본다)
const STOP = new Set(["학생", "활동", "수업", "과정", "통해", "있다", "있음", "이해", "설명", "다양", "관련", "대한", "이를", "자신"]);
const words = (s: string) => new Set((s.match(/[가-힣A-Za-z]{2,}/g) ?? []).map((w) => w.slice(0, 3)).filter((w) => !STOP.has(w.slice(0, 2)) && !STOP.has(w)));

export type PickedStandard = StandardItem & { unit: string; score: number };

/** 활동 글과 겹치는 낱말이 많은 성취기준부터 (겹치는 게 없으면 고르지 않는다) */
export function pickStandards(subject: SubjectStandards, activity: string, limit = 5): PickedStandard[] {
  const act = words(activity);
  if (!act.size) return [];
  const scored: PickedStandard[] = [];
  for (const u of subject.units) {
    const unitWords = words([u.name, ...u.elements].join(" "));
    for (const s of u.standards) {
      const sw = words(s.text);
      let score = 0;
      for (const w of sw) if (act.has(w)) score += 2;
      for (const w of unitWords) if (act.has(w)) score += 1;
      if (score > 0) scored.push({ ...s, unit: u.name, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** AI에 붙일 성취기준 블록. 겹치는 성취기준이 없으면 과목의 단원·내용 요소만 짧게 */
export function standardsBlock(name: string, subject: SubjectStandards, activity: string): string {
  const picked = pickStandards(subject, activity);
  const units = picked.length ? [...new Set(picked.map((p) => p.unit))] : subject.units.map((u) => u.name);
  const elements = subject.units.filter((u) => units.includes(u.name)).flatMap((u) => u.elements).slice(0, 12);
  return [
    `<성취기준 과목="${name}">`,
    ...(picked.length ? ["활동과 이어지는 성취기준:", ...picked.map((p) => `- ${p.code} (${p.unit}) ${p.text}`)] : [`단원: ${units.slice(0, 8).join(", ")}`]),
    elements.length ? `내용 요소: ${elements.join(", ")}` : null,
    "</성취기준>",
    "성취기준 반영: 학생 활동에 이미 있는 내용을 부르는 이름으로만 성취기준의 개념·내용 요소를 쓴다 (예: 활동이 운동 에너지와 위치 에너지를 비교했다면 '역학적 에너지 보존'이라 부를 수 있음). 학생이 하지 않은 해석·설명·이론 적용을 성취기준에 맞추려고 덧붙이지 않는다. 성취기준 코드나 문장을 그대로 옮기지 않는다.",
  ].filter((x): x is string => !!x).join("\n");
}
