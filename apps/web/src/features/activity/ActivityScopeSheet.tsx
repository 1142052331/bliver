import type { ActivityQuery } from '@bliver/contracts';
import { Button } from '@bliver/ui';
import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import {
  gsap,
  motionTokens,
  useGSAP,
  withMotionPreferences,
} from '../../platform/motion/gsap.js';

export function ActivityScopeSheet({ value, onChange, onClose }: { readonly value: ActivityQuery; readonly onChange: (value: ActivityQuery) => void; readonly onClose: () => void }) {
  const { t } = useTranslation();
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => { close.current?.focus(); }, []);

  useGSAP(() => {
    const root = backdrop.current;
    const surface = panel.current;
    if (!root || !surface) return;

    return withMotionPreferences(root, ({ reducedMotion }) => {
      if (reducedMotion) {
        gsap.set(surface, { clearProps: 'transform,opacity,visibility' });
        return;
      }
      const entrance = gsap.fromTo(surface, {
        autoAlpha: 0.8,
        y: 18,
      }, {
        autoAlpha: 1,
        y: 0,
        duration: motionTokens.duration.state,
        ease: motionTokens.ease.route,
        clearProps: 'transform,opacity,visibility',
      });
      return () => entrance.kill();
    });
  }, { scope: backdrop });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('button,select,[tabindex]:not([tabindex="-1"])') ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const stopPropagation = (event: MouseEvent<HTMLDivElement>): void => event.stopPropagation();

  return (
    <div ref={backdrop} className="activity-scope-backdrop" onMouseDown={onClose}>
      <div ref={panel} className="activity-scope" role="dialog" aria-modal="true" aria-label={t('activity.filterDialog')} onKeyDown={onKeyDown} onMouseDown={stopPropagation}>
        <div className="activity-scope__bar"><span><SlidersHorizontal aria-hidden="true" /><strong>{t('activity.filterMoments')}</strong></span><Button ref={close} variant="ghost" aria-label={t('activity.closeFilters')} onClick={onClose}><X aria-hidden="true" />{t('activity.close')}</Button></div>
        <div className="activity-scope__fields">
          <label><span>{t('activity.area')}</span><select aria-label={t('activity.area')} value={value.scope} onChange={(event) => onChange({ ...value, scope: event.target.value as ActivityQuery['scope'] })}><option value="smart">{t('activity.nearbyFirst')}</option><option value="region">{t('activity.region')}</option><option value="country">{t('activity.country')}</option><option value="global">{t('activity.worldwide')}</option></select></label>
          <label><span>{t('activity.people')}</span><select aria-label={t('activity.people')} value={value.relationship} onChange={(event) => onChange({ ...value, relationship: event.target.value as ActivityQuery['relationship'] })}><option value="all">{t('activity.everyoneVisible')}</option><option value="friends">{t('activity.friendsOnly')}</option><option value="public">{t('activity.publicMoments')}</option></select></label>
          <label><span>{t('activity.content')}</span><select aria-label={t('activity.content')} value={value.content} onChange={(event) => onChange({ ...value, content: event.target.value as ActivityQuery['content'] })}><option value="all">{t('activity.allMoments')}</option><option value="unread">{t('activity.unread')}</option><option value="media">{t('activity.photos')}</option></select></label>
        </div>
      </div>
    </div>
  );
}
