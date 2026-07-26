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
      <div className="app-loading-scene__status">
        <span aria-hidden="true" className="app-loading-scene__track">
          <span className="app-loading-scene__indicator" />
        </span>
        <p>{label}</p>
      </div>
    </div>
  );
}
