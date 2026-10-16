import { AppShell } from "@/components/shell/app-shell";
import { isDemo } from "@/lib/server/env";
import { requireViewer } from "@/lib/server/viewer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return (
    <AppShell viewer={viewer} demo={isDemo}>
      {children}
    </AppShell>
  );
}
