import type { ReactNode } from 'react';

export interface StatusViewProps {
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}

export function StatusView({ title, body, action }: StatusViewProps) {
  return (
    <section className="bliver-status">
      <h1 className="bliver-status__title">{title}</h1>
      <p className="bliver-status__body">{body}</p>
      {action ? <div className="bliver-status__action">{action}</div> : null}
    </section>
  );
}
