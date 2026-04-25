import { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 pb-6 border-b border-border/60 mb-8">
      <div className="space-y-1.5">
        {eyebrow && (
          <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80 font-medium">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl md:text-[34px] font-serif leading-tight tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="elevated-card rounded-2xl py-16 px-8 flex flex-col items-center justify-center text-center gap-4">
      {icon && (
        <div className="h-12 w-12 rounded-xl bg-primary/10 grid place-items-center text-primary">
          {icon}
        </div>
      )}
      <div className="space-y-1.5 max-w-md">
        <h3 className="text-lg font-medium">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
