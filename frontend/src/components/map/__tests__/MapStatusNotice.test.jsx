import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import MapStatusNotice from '../MapStatusNotice';

it('uses an exported map-pin-off icon for tile failures', () => {
  const { container } = render(
    <MapStatusNotice kind="tile" message="Map unavailable" />,
  );

  expect(container.querySelector('.lucide-map-pin-off')).toBeInTheDocument();
});
