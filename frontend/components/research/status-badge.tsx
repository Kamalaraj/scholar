import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Loader2,
  PenLine,
  UserRound,
  XCircle,
  Ban,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RunStatus } from "@/lib/api";

const STATUS: Record<RunStatus, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: "Queued", icon: Clock, className: "text-muted-foreground" },
  planning: { label: "Planning", icon: Loader2, className: "text-primary" },
  awaiting_approval: {
    label: "Needs review",
    icon: UserRound,
    className: "border-warning text-warning",
  },
  researching: { label: "Researching", icon: BookOpenCheck, className: "text-primary" },
  writing: { label: "Writing", icon: PenLine, className: "text-primary" },
  completed: { label: "Done", icon: CheckCircle2, className: "text-success" },
  failed: { label: "Failed", icon: XCircle, className: "border-destructive text-destructive" },
  cancelled: { label: "Cancelled", icon: Ban, className: "text-muted-foreground" },
};

/** Color is never the only signal: every status has an icon and a text label. */
export function StatusBadge({ status }: { status: RunStatus }) {
  const { label, icon: Icon, className } = STATUS[status];
  return (
    <Badge variant="outline" className={className}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
