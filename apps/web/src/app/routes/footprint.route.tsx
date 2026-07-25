import { useNavigate, useParams } from 'react-router-dom';

import { FootprintDetailRoute } from '../../features/footprints/FootprintDetailRoute.js';

export function Component() {
  const footprintId = useParams().footprintId ?? '';
  const navigate = useNavigate();

  const close = (): void => {
    if (
      typeof window !== 'undefined' &&
      typeof window.history.state?.idx === 'number' &&
      window.history.state.idx > 0
    ) {
      navigate(-1);
    } else {
      navigate('/map', { replace: true });
    }
  };

  return (
    <FootprintDetailRoute
      loadFromApi
      footprint={{
        id: footprintId,
        message: 'Footprint detail',
        visibility: 'public',
        locationPrecision: 'approximate',
      }}
      onClose={close}
    />
  );
}
