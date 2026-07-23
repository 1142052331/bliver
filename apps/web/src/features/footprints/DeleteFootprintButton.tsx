import { IconButton } from '@bliver/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { deleteFootprint, footprintKey } from './api.js';
import { footprintDefault, type FootprintTranslationKey } from './translations.js';

interface DeleteFootprintButtonProps {
  readonly footprintId: string;
  readonly className?: string;
  readonly onDeleted?: () => void;
}

export function DeleteFootprintButton({ footprintId, className, onDeleted }: DeleteFootprintButtonProps) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = (key: FootprintTranslationKey): string => String(t(`footprints.${key}`, { defaultValue: footprintDefault(key) }));

  const remove = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    if (busy || !window.confirm(copy('deleteConfirm'))) return;
    setBusy(true);
    setFailed(false);
    try {
      await deleteFootprint(footprintId);
      client.removeQueries({ queryKey: footprintKey(footprintId) });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['activity'] }),
        client.invalidateQueries({ queryKey: ['map', 'footprints'] }),
        client.invalidateQueries({ queryKey: ['memories'] }),
      ]);
      onDeleted?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={`footprint-delete-control${className ? ` ${className}` : ''}`}>
      <IconButton
        className="footprint-delete-control__button"
        label={copy('deleteLabel')}
        loading={busy}
        onClick={(event) => void remove(event)}
      >
        <Trash2 aria-hidden="true" />
      </IconButton>
      {failed ? <span className="footprint-delete-control__error" role="alert">{copy('deleteFailed')}</span> : null}
    </span>
  );
}
