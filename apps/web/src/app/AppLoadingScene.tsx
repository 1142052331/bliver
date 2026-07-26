import { QuietLoadingIndicator } from '../components/status/QuietLoadingIndicator.js';
import './app-loading-scene.css';

export interface AppLoadingSceneProps {
  readonly label: string;
}

export function AppLoadingScene({ label }: AppLoadingSceneProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="app-loading-scene"
      role="status"
    >
      <QuietLoadingIndicator label={label} />
    </div>
  );
}
