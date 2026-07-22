import { StatusView } from '@bliver/ui';
import type { LucideIcon } from 'lucide-react';
import { lazy, Suspense, useRef, type ReactNode } from 'react';

import { OptionalMotionBoundary } from './OptionalMotion.js';
import './app-status-scene.css';

const LazyAppStatusSceneMotion = lazy(() =>
  import('./AppStatusSceneMotion.js').then(({ AppStatusSceneMotion }) => ({
    default: AppStatusSceneMotion,
  })),
);

export interface AppStatusSceneProps {
  readonly Icon: LucideIcon;
  readonly code?: string;
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
  readonly busy?: boolean;
}

export function AppStatusScene({
  Icon,
  code,
  title,
  body,
  action,
  busy = false,
}: AppStatusSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const statusLabel = code;
  const statusKind = code?.split('/')[0]?.trim().toLowerCase() ?? 'system';

  return (
    <div
      ref={sceneRef}
      aria-busy={busy || undefined}
      className={`app-status-scene app-status-scene--work app-status-scene--${statusKind}${busy ? ' is-busy' : ''}`}
      data-status-kind={statusKind}
    >
      <div
        aria-hidden="true"
        className="app-status-scene__field"
        data-status-field
      >
        <svg
          className="app-status-scene__atlas"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 1600 900"
        >
          <path
            className="app-status-scene__district"
            d="M942 -80H1680V980H1042C983 903 1004 824 941 748C871 665 789 645 773 547C756 442 854 387 857 288C861 178 794 92 840 9C865 -36 898 -60 942 -80Z"
            data-status-district
          />
          <g className="app-status-scene__network" data-status-network>
            <path d="M-60 152C218 121 396 174 624 137C858 99 1068 12 1660 70" />
            <path d="M-80 347C202 305 425 348 630 314C907 269 1144 170 1680 234" />
            <path d="M-60 596C201 535 437 584 653 535C905 477 1221 380 1666 454" />
            <path d="M-30 812C262 740 477 781 729 727C1011 666 1260 611 1640 642" />
            <path d="M208 -40C174 198 248 365 213 539C186 677 96 768 120 958" />
            <path d="M468 -80C418 143 494 306 462 486C434 643 351 753 378 970" />
            <path d="M714 -60C662 129 750 269 716 439C681 615 607 750 643 960" />
            <path d="M1013 -40C951 144 1042 294 1004 477C974 623 909 753 938 960" />
            <path d="M1314 -70C1238 143 1352 300 1306 502C1271 656 1202 780 1238 970" />
            <path d="M1490 -30C1419 157 1530 331 1484 541C1454 680 1390 792 1414 950" />
          </g>
          <g className="app-status-scene__blocks" data-status-network>
            <path d="M73 236L303 211L325 286L93 309Z" />
            <path d="M354 203L594 184L618 259L379 281Z" />
            <path d="M158 420L399 398L417 493L176 517Z" />
            <path d="M490 397L718 367L738 467L509 492Z" />
            <path d="M1021 505L1238 471L1270 572L1050 609Z" />
            <path d="M1294 444L1517 423L1541 528L1318 551Z" />
            <path d="M1050 687L1268 655L1296 750L1072 790Z" />
          </g>
          <path
            className="app-status-scene__route app-status-scene__route--origin"
            d="M-40 693C171 648 341 574 522 522C671 480 760 473 875 418"
            data-status-trace
            pathLength="1"
          />
          <path
            className="app-status-scene__route app-status-scene__route--signal"
            d="M875 418C960 377 1042 330 1134 292C1292 226 1440 213 1645 184"
            data-status-trace
            pathLength="1"
          />
          <circle
            className="app-status-scene__route-stop"
            cx="875"
            cy="418"
            r="8"
          />
        </svg>

        <div className="app-status-scene__field-meta">
          {statusLabel ? (
            <span className="app-status-scene__code">{statusLabel}</span>
          ) : null}
          <span className="app-status-scene__coordinates">
            BLIVER
          </span>
        </div>
        <span
          className="app-status-scene__point-ring"
          data-status-point-ring
        />
        <span className="app-status-scene__point" data-status-point>
          <Icon data-status-point-icon />
        </span>
      </div>

      <div className="app-status-scene__message">
        {statusLabel ? (
          <div className="app-status-scene__message-rail" data-status-detail>
            <span className="app-status-scene__message-signal" aria-hidden="true" />
            <p className="app-status-scene__message-code">{statusLabel}</p>
          </div>
        ) : null}
        <div className="app-status-scene__message-content" data-status-detail>
          <StatusView title={title} body={body} action={action} />
        </div>
        <span
          aria-hidden="true"
          className="app-status-scene__measure"
          data-status-measure
        />
      </div>

      <OptionalMotionBoundary>
        <Suspense fallback={null}>
          <LazyAppStatusSceneMotion
            rootRef={sceneRef}
            busy={busy}
            statusKind={statusKind}
            {...(statusLabel !== undefined ? { statusLabel } : {})}
          />
        </Suspense>
      </OptionalMotionBoundary>
    </div>
  );
}
