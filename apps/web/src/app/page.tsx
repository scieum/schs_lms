import { redirect } from "next/navigation";
import { homePath } from "@/lib/domain/policy";
import { requireViewer } from "@/lib/server/viewer";

export default async function Root() {
  redirect(homePath(await requireViewer()));
}
