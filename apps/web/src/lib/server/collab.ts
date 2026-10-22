import "server-only";
import type { CollabRoom } from "@/lib/domain/collab";
import { repo } from "./repo";
import type { RoomRow } from "./repo/modules/collab";

// 협업방 (Figma N69): 방 줄 → 멤버 이름 · 부서를 붙인 방 (방장 먼저)
export async function namedRoom(r: RoomRow): Promise<CollabRoom> {
  const teachers = await repo.listTeachers();
  return {
    id: r.id, name: r.name, intro: r.intro, ownerId: r.ownerId, createdAt: r.createdAt,
    members: r.memberIds
      .map((t) => { const x = teachers.find((y) => y.id === t); return { teacherId: t, name: x?.name ?? "선생님", dept: x?.dept ?? null, owner: t === r.ownerId }; })
      .sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name, "ko")),
  };
}
