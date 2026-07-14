import { Surface } from '@bliver/ui';

export interface RoutePlaceholderProps {
  readonly title: string;
}

export function RoutePlaceholder({ title }: RoutePlaceholderProps) {
  return (
    <Surface aria-labelledby={`${title}-route-title`} className="route-placeholder">
      <p>V2 foundation</p>
      <h1 id={`${title}-route-title`}>{title}</h1>
      <p>This feature is pending migration into the V2 module boundary.</p>
    </Surface>
  );
}
