import type { ReactNode } from "react";

export function GuidedEmptyState({
  symbol = "✦",
  eyebrow,
  title,
  description,
  children,
  compact = false,
}: {
  symbol?: string;
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`content-state guided-empty-state${compact ? " guided-empty-state--compact" : ""}`}>
      <span className="state-symbol" aria-hidden="true">{symbol}</span>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {children ? <div className="record-actions">{children}</div> : null}
    </div>
  );
}
