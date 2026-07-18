export interface SkeletonProps {
  readonly label: string;
  readonly lines?: number;
}

export function Skeleton({ label, lines = 1 }: SkeletonProps) {
  const lineCount = Number.isFinite(lines)
    ? Math.max(1, Math.floor(lines))
    : 1;

  return (
    <div
      className="bliver-skeleton"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      {Array.from({ length: lineCount }, (_, index) => (
        <span key={index} aria-hidden="true" />
      ))}
    </div>
  );
}
