import { STATUS_TONE } from "@/lib/constants";
import { cn, titleFromSnake } from "@/lib/utils";

const tones = {
  warn: "bg-warn-bg text-warn",
  info: "bg-info-bg text-info",
  ok: "bg-ok-bg text-ok",
  danger: "bg-danger-bg text-danger",
  muted: "bg-muted-bg text-muted",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status?.toLowerCase()] ?? "muted";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[4px] px-2 text-[12px] font-medium",
        tones[tone], className
      )}
    >
      {titleFromSnake(status)}
    </span>
  );
}
