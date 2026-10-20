import { Bookmark, BookOpenCheck } from "lucide-react";
import type { CommunityTotals } from "@/lib/community-events";

export default function CommunityStats({ stats }: { stats?: CommunityTotals }) {
  return <div className="community-totals" aria-label="Community totals" aria-live="polite">
    <span><Bookmark size={13} strokeWidth={1.5} aria-hidden="true" /><strong>{stats?.saves.toLocaleString() ?? "—"}</strong> {stats?.saves===1?"bookmark":"bookmarks"}</span>
    <span><BookOpenCheck size={13} strokeWidth={1.5} aria-hidden="true" /><strong>{stats?.reads.toLocaleString() ?? "—"}</strong> {stats?.reads===1?"logged read":"logged reads"}</span>
  </div>;
}
