import {
  AlertCircle, BarChart3, BookOpen, ClipboardList, FileText, Home, List, MessageCircle, Moon,
  RefreshCw, ShieldCheck, Sparkles, Target, User, UserPlus, Users,
} from "lucide-react";
import type { IconName } from "./nav";

const MAP = {
  home: Home, file: FileText, clipboard: ClipboardList, users: Users, chat: MessageCircle, userPlus: UserPlus,
  chart: BarChart3, target: Target, moon: Moon, book: BookOpen, sparkle: Sparkles, list: List,
  alert: AlertCircle, refresh: RefreshCw, shield: ShieldCheck, user: User,
} satisfies Record<IconName, unknown>;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  const C = MAP[name];
  return <C size={size} strokeWidth={1.8} className={className} aria-hidden />;
}
