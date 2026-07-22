import { Component, type ReactNode } from 'react';

interface OptionalMotionBoundaryProps {
  readonly children: ReactNode;
}

interface OptionalMotionBoundaryState {
  readonly failed: boolean;
}

/**
 * Motion is an enhancement. A failed dynamic animation chunk must never
 * replace the route or status content with an error fallback.
 */
export class OptionalMotionBoundary extends Component<
  OptionalMotionBoundaryProps,
  OptionalMotionBoundaryState
> {
  public override state: OptionalMotionBoundaryState = { failed: false };

  public static getDerivedStateFromError(): OptionalMotionBoundaryState {
    return { failed: true };
  }

  public override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
