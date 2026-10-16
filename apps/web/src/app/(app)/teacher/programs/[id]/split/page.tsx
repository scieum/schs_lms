import { Scissors } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/app-shell";
import { ButtonLink, Card, Row } from "@/components/ui";
import { aiEnabled } from "@/lib/server/ai/claude";
import { repo } from "@/lib/server/repo";
import { programRows, requireProgram } from "../../_lib/data";
import { pdfPages } from "../../_lib/pdf";
import { SplitEditor } from "./split-editor";

export const metadata = { title: "합본 PDF 나누기 · 속초고등학교 학생관리시스템" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ file?: string }> };

export default async function SplitPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { program: p } = await requireProgram(id);
  const fileId = (await searchParams).file ?? "";
  const [{ rows }, m] = await Promise.all([programRows(p), fileId ? repo.getMaterial(fileId) : null]);
  const back = <ButtonLink href={`/teacher/programs/${p.id}/materials?mode=bundle`} kind="outline" size="sm">취소</ButtonLink>;

  if (!m || m.programId !== p.id || m.status !== "bundle" || m.mime !== "application/pdf") {
    const bundles = (await repo.listMaterials(p.id)).filter((x) => x.status === "bundle" && x.mime === "application/pdf");
    return (
      <>
        <PageHeader title="합본 PDF 나누기" actions={back} />
        <PageBody>
          <Card title="나눌 합본 고르기">
            {bundles.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">나누기 전 합본 PDF가 없어요. 자료 등록에서 합본을 올려 주세요</p>
            ) : (
              bundles.map((b, i) => (
                <Row key={b.id} last={i === bundles.length - 1} title={b.fileName} meta={`${b.pages ?? "?"}쪽`}
                  right={<ButtonLink href={`/teacher/programs/${p.id}/split?file=${b.id}`} size="sm" kind="outline"><Scissors size={14} /> 나누기</ButtonLink>} />
              ))
            )}
          </Card>
        </PageBody>
      </>
    );
  }

  const bytes = await repo.getMaterialFile(m);
  const pages = (bytes && (await pdfPages(bytes))) || m.pages || 0;
  return (
    <>
      <PageHeader title="합본 PDF 나누기" actions={back} />
      <PageBody>
        <p className="-mt-2 truncate text-[13px] text-mute md:-mt-4">{m.fileName} · {pages}쪽 · &quot;1–2쪽은 ○○○&quot;처럼 쪽 범위를 학생에게 지정하면 학생별 파일로 나눠요</p>
        {pages === 0 ? (
          <Card><p className="py-6 text-center text-sm text-bad">PDF를 열지 못했어요. 파일을 다시 올려 주세요</p></Card>
        ) : (
          <SplitEditor
            programId={p.id}
            materialId={m.id}
            pages={pages}
            aiOn={aiEnabled()}
            fileHref={`/teacher/programs/${p.id}/materials/file/${m.id}`}
            students={rows.map((r) => ({ id: r.student.id, label: `${r.student.grade}-${r.student.classNo}-${r.student.number} ${r.student.name}`, sub: r.materials.length ? "서류 있음" : "서류 없음" }))}
          />
        )}
      </PageBody>
    </>
  );
}
