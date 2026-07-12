import { useCallback, useEffect, useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import {
  Camera,
  Check,
  Loader2,
  MapPin,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiClient } from '../api';
import { getUser } from '../auth';
import LocationPermissionNotice from './LocationPermissionNotice';
import { markLocationReminder } from '../domain/locationReminder';
import useDialogFocusTrap from '../hooks/useDialogFocusTrap';
import useUIStore from '../store/useUIStore';

const PREFERENCE_PREFIX = 'bliver_checkin_publication_v1:';
const VALID_VISIBILITIES = new Set(['public', 'friends', 'private']);
const VALID_PRECISIONS = new Set(['approximate', 'precise']);

const AUDIENCE_OPTIONS = [
  { value: 'public', label: '公开', detail: '所有人可见，24 小时内会进入公开动态' },
  { value: 'friends', label: '仅好友', detail: '只有你和好友可以看到' },
  { value: 'private', label: '仅自己', detail: '只有你可以看到' },
];

const PRECISION_OPTIONS = [
  { value: 'approximate', label: '大致位置', detail: '地图上显示附近区域' },
  { value: 'precise', label: '精确位置', detail: '地图上显示这个坐标' },
];

const MOODS = [
  ['😊', '开心'],
  ['😭', '难过'],
  ['😋', '满足'],
  ['🏋️', '活力'],
  ['😴', '困倦'],
  ['🍺', '放松'],
];

const PUBLISH_LABELS = {
  public: '公开发布足迹',
  friends: '向好友发布足迹',
  private: '保存私人足迹',
};

function preferenceKey(viewerKey) {
  return `${PREFERENCE_PREFIX}${encodeURIComponent(viewerKey || 'guest')}`;
}

function loadPublicationPreferences(viewerKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(preferenceKey(viewerKey)));
    return {
      visibility: VALID_VISIBILITIES.has(parsed?.visibility) ? parsed.visibility : 'public',
      locationPrecision: VALID_PRECISIONS.has(parsed?.locationPrecision)
        ? parsed.locationPrecision
        : 'approximate',
    };
  } catch {
    return { visibility: 'public', locationPrecision: 'approximate' };
  }
}

function getInitialPreferences(viewerKey) {
  const stored = loadPublicationPreferences(viewerKey);
  const savedUser = getUser();
  if (savedUser?.lastFootprintVisibility && VALID_VISIBILITIES.has(savedUser.lastFootprintVisibility)) {
    stored.visibility = savedUser.lastFootprintVisibility;
  }
  return stored;
}

function savePublicationPreferences(viewerKey, visibility, locationPrecision) {
  try {
    localStorage.setItem(preferenceKey(viewerKey), JSON.stringify({ visibility, locationPrecision }));
  } catch {
    // Publishing must still work when browser storage is unavailable.
  }
}

export default function CheckInModal({ isOpen, onClose, presetLocation = null }) {
  if (!isOpen) return null;
  return <OpenCheckInModal onClose={onClose} presetLocation={presetLocation} />;
}

function OpenCheckInModal({ onClose, presetLocation }) {
  const viewerKey = getUser()?._id || 'guest';
  const initialPreferences = getInitialPreferences(viewerKey);
  const hasPresetLocation = presetLocation?.lat != null && presetLocation?.lng != null;
  const [message, setMessage] = useState('');
  const [mood, setMood] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(() => (hasPresetLocation
    ? { lat: presetLocation.lat, lng: presetLocation.lng }
    : null));
  const [locating, setLocating] = useState(!hasPresetLocation);
  const [permissionState, setPermissionState] = useState(hasPresetLocation ? 'granted' : 'locating');
  const [visibility, setVisibility] = useState(initialPreferences.visibility);
  const [locationPrecision, setLocationPrecision] = useState(initialPreferences.locationPrecision);
  const [submissionError, setSubmissionError] = useState('');
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);
  const dialogRef = useRef(null);
  const mountedRef = useRef(true);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    revokePreview();
  }, [revokePreview]);

  useEffect(() => {
    if (hasPresetLocation) return undefined;
    const now = Date.now();
    markLocationReminder(viewerKey, now, localStorage, 'locating');

    if (!navigator.geolocation) {
      queueMicrotask(() => {
        if (!mountedRef.current) return;
        setLocating(false);
        setPermissionState('unavailable');
        markLocationReminder(viewerKey, now, localStorage, 'unavailable');
      });
      return undefined;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return;
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
        setPermissionState('granted');
        markLocationReminder(viewerKey, now, localStorage, 'granted');
      },
      (error) => {
        if (!mountedRef.current) return;
        const nextState = error?.code === 1 ? 'denied' : 'error';
        setLocation(null);
        setLocating(false);
        setPermissionState(nextState);
        markLocationReminder(viewerKey, now, localStorage, nextState);
      },
      { timeout: 15000, enableHighAccuracy: true },
    );
    return undefined;
  }, [hasPresetLocation, viewerKey]);

  const requestLocation = useCallback(() => {
    const now = Date.now();
    setLocating(true);
    setPermissionState('locating');
    setSubmissionError('');
    markLocationReminder(viewerKey, now, localStorage, 'locating');

    if (!navigator.geolocation) {
      setLocation(null);
      setLocating(false);
      setPermissionState('unavailable');
      markLocationReminder(viewerKey, now, localStorage, 'unavailable');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return;
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
        setPermissionState('granted');
        markLocationReminder(viewerKey, now, localStorage, 'granted');
      },
      (error) => {
        if (!mountedRef.current) return;
        const nextState = error?.code === 1 ? 'denied' : 'error';
        setLocation(null);
        setLocating(false);
        setPermissionState(nextState);
        markLocationReminder(viewerKey, now, localStorage, nextState);
      },
      { timeout: 15000, enableHighAccuracy: true },
    );
  }, [viewerKey]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSubmissionError('');
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
      if (!mountedRef.current) return;
      setPhoto(compressed);
      revokePreview();
      const url = URL.createObjectURL(compressed);
      previewUrlRef.current = url;
      setPreview(url);
    } catch {
      if (mountedRef.current) setSubmissionError('照片处理失败，请重新选择一张照片。');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!location || location.lat == null) return;
    setLoading(true);
    setSubmissionError('');

    const form = new FormData();
    form.append('lat', String(location.lat));
    form.append('lng', String(location.lng));
    form.append('message', message);
    if (mood) form.append('mood', mood);
    if (photo) form.append('photo', photo);
    form.append('visibility', visibility);
    form.append('locationPrecision', locationPrecision);
    form.append('precise', String(locationPrecision === 'precise'));

    try {
      await apiClient.footprints.checkin(form);
      savePublicationPreferences(viewerKey, visibility, locationPrecision);
      const savedUser = getUser();
      if (savedUser && savedUser._id === viewerKey) {
        localStorage.setItem('bliver_user', JSON.stringify({ ...savedUser, lastFootprintVisibility: visibility }));
      }
      revokePreview();
      onClose();
      if (!localStorage.getItem('feedback_submitted')) {
        setTimeout(() => useUIStore.getState().openFeedback(), 600);
      }
    } catch (error) {
      console.error(error);
      if (mountedRef.current) setSubmissionError('发布失败，你填写的内容已保留。请检查网络后重试。');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleClose = () => {
    revokePreview();
    onClose();
  };

  useDialogFocusTrap(dialogRef, true, handleClose);

  const audience = AUDIENCE_OPTIONS.find((option) => option.value === visibility);
  const precision = PRECISION_OPTIONS.find((option) => option.value === locationPrecision);

  return (
    <div className="bliver-checkin-layer">
      <div aria-hidden="true" className="bliver-checkin-backdrop" onClick={handleClose} />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-in-modal-title"
        tabIndex={-1}
        className="bliver-checkin"
      >
        <div className="bliver-checkin__handle" aria-hidden="true" />
        <header className="bliver-checkin__header">
          <div>
            <h2 id="check-in-modal-title"><MapPin size={20} aria-hidden="true" />发布足迹</h2>
            <p>记录这一刻，也决定谁能看到它。</p>
          </div>
          <button
            type="button"
            aria-label="关闭发布足迹"
            data-dialog-initial-focus
            onClick={handleClose}
            className="bliver-checkin__close"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="bliver-checkin__location" aria-live="polite">
          {locating ? (
            <><Loader2 size={18} className="bliver-checkin__spinner" aria-hidden="true" /><span>正在获取位置</span></>
          ) : location?.lat != null ? (
            <><MapPin size={18} aria-hidden="true" /><span>{locationPrecision === 'precise'
              ? `当前位置 ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
              : '附近区域（约 2.5 公里范围）'}</span></>
          ) : (
            <><MapPin size={18} aria-hidden="true" /><span>尚未取得可发布的位置</span></>
          )}
        </div>

        {['denied', 'unavailable', 'error'].includes(permissionState) && (
          <LocationPermissionNotice
            permissionState={permissionState}
            viewerKey={viewerKey}
            onRequestLocation={requestLocation}
          />
        )}

        <form onSubmit={handleSubmit} className="bliver-checkin__form">
          <label className="bliver-checkin__message-label" htmlFor="checkin-message">这一刻</label>
          <textarea
            id="checkin-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="写下此刻的见闻或心情"
            maxLength={1000}
          />

          <fieldset className="bliver-checkin__moods">
            <legend>此刻心情</legend>
            <div>
              {MOODS.map(([emoji, label]) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={label}
                  aria-pressed={mood === emoji}
                  onClick={() => setMood(mood === emoji ? '' : emoji)}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} className="bliver-checkin__file" hidden />
          <div className="bliver-checkin__photo-row">
            <button type="button" onClick={() => fileRef.current?.click()}>
              <Camera size={18} aria-hidden="true" />
              {photo ? '更换照片' : '添加照片'}
            </button>
            {preview && <img src={preview} alt="待发布照片预览" />}
            {photo && <button type="button" aria-label="移除照片" onClick={() => {
              setPhoto(null);
              setPreview('');
              revokePreview();
              if (fileRef.current) fileRef.current.value = '';
            }}>移除照片</button>}
          </div>

          <fieldset className="bliver-checkin__decision">
            <legend>谁可以看到</legend>
            <div className="bliver-checkin__choices bliver-checkin__choices--audience">
              {AUDIENCE_OPTIONS.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="visibility"
                    value={option.value}
                    checked={visibility === option.value}
                    onChange={() => setVisibility(option.value)}
                  />
                  <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                  <Check size={18} aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="bliver-checkin__decision">
            <legend>位置显示</legend>
            <div className="bliver-checkin__choices bliver-checkin__choices--precision">
              {PRECISION_OPTIONS.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="locationPrecision"
                    value={option.value}
                    checked={locationPrecision === option.value}
                    onChange={() => setLocationPrecision(option.value)}
                  />
                  <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                  <Check size={18} aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          {locationPrecision === 'precise' && (
            <p className="bliver-checkin__precision-guidance">
              <MapPin size={17} aria-hidden="true" />
              精确位置会显示到地图上的具体坐标，请确认这符合你的分享意愿。
            </p>
          )}

          {submissionError && <p className="bliver-checkin__error" role="alert">{submissionError}</p>}

          <footer className="bliver-checkin__publish">
            <div className="bliver-checkin__summary">
              <ShieldCheck size={18} aria-hidden="true" />
              <span><small>本次发布</small><strong>{audience.label} · {precision.label}</strong></span>
            </div>
            <button type="submit" disabled={loading || locating || location?.lat == null}>
              {loading && <Loader2 size={18} className="bliver-checkin__spinner" aria-hidden="true" />}
              {PUBLISH_LABELS[visibility]}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
