import { Card } from "./Card";
import { Button } from "./Button";
import * as React from "react";

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-11 items-center gap-4 px-4">
          <div className="h-3 w-1/4 rounded bg-canvas" />
          <div className="h-3 w-1/6 rounded bg-canvas" />
          <div className="h-3 w-1/5 rounded bg-canvas" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  message, actionLabel, onAction,
}: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <p className="text-[14px] text-ink-2">{message}</p>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-danger/40 bg-danger-bg/40 p-4">
      <p className="text-[14px] text-danger">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}
