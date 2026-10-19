"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { holdUntilFrom, kstToday, optionValue, parseOption, type RetentionKey } from "@/lib/domain/retention";
import { repo } from "@/lib/server/repo";
import { loadRetentionBundles, nextDue, runRetentionSweep } from "@/lib/server/retention-sweep";
import { requireCan } from "@/lib/server/viewer";

// 자료 보존 · 파기 (Figma N39 f): 설정 저장 · 한 번 미루기 · 지금 확인하기. 감사 로그에는 건수·값만.

const back = (msg: string) => redirect(`/admin/retention?msg=${encodeURIComponent(msg)}`);

export async function saveRetention(fd: FormData) {
  const v = await requireCan("retention.manage");
  const cur = await repo.getRetentionSettings();
  const keys: RetentionKey[] = ["raw_files", "extracted_text"];
  const next = keys.map((key) => parseOption(key, String(fd.get(key) ?? "")));
  if (next.some((x) => !x)) back("고를 수 있는 값이 아니에요");
  let changed = 0;
  let error = "";
  try {
    for (const n of next) {
      if (!n || optionValue(cur[n.key]) === optionValue(n)) continue;
      await repo.setRetentionSetting(n, v.accountId);
      await repo.audit(v.accountId, "retention.update", JSON.stringify({ key: n.key, from: optionValue(cur[n.key]), to: optionValue(n) }));
      changed++;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "저장하지 못했어요";
  }
  if (error) back(error);
  revalidatePath("/admin/retention");
  back(changed ? "저장했어요 · 다음 확인 때 새 기간으로 지워요" : "바뀐 값이 없어요");
}

/** 한 번 미루기 (30일): 묶음(프로그램)마다 1번 */
export async function holdRetention(fd: FormData) {
  const v = await requireCan("retention.manage");
  const target = String(fd.get("target") ?? "");
  const { bundles } = await loadRetentionBundles();
  const b = bundles.find((x) => x.target === target);
  const nd = b ? nextDue(b) : null;
  if (!b || !nd?.due) back("미룰 자료를 찾지 못했어요");
  if (b!.holdUntil) back("이미 한 번 미뤘어요");
  const until = holdUntilFrom(nd!.due!);
  let ok = false;
  try {
    ok = await repo.addRetentionHold(target, until, v.accountId);
  } catch (e) {
    back(e instanceof Error ? e.message : "미루지 못했어요");
  }
  if (!ok) back("이미 한 번 미뤘어요");
  await repo.audit(v.accountId, "retention.hold", `${b!.label} → ${until}`);
  revalidatePath("/admin/retention");
  back(`${b!.label} 파기를 ${until}로 미뤘어요`);
}

/** 지금 확인하기: 지울 날이 지난 자료를 바로 지운다 */
export async function runRetentionNow() {
  const v = await requireCan("retention.manage");
  let line = "";
  try {
    const r = await runRetentionSweep("admin", v.accountId, kstToday());
    await repo.audit(v.accountId, "retention.run", `프로그램 ${r.programs}개 · 원본 ${r.files}개 · 글 ${r.texts}건`);
    line = r.programs ? `확인했어요 · 원본 ${r.files}개 · 글 ${r.texts}건 지웠어요` : "확인했어요 · 지울 자료가 없어요";
  } catch (e) {
    line = e instanceof Error ? e.message : "확인하지 못했어요";
  }
  revalidatePath("/admin/retention");
  back(line);
}
