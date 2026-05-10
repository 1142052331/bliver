import { useState, useRef, useEffect } from 'react';
import api from '../api';
import imageCompression from 'browser-image-compression';
import { X, MapPin, Camera, Loader2 } from 'lucide-react';

export default function CheckInModal({ isOpen, onClose }) {
  const [message, setMessage] = useState('');
  const [mood, setMood] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locDenied, setLocDenied] = useState(false);
  const [precise, setPrecise] = useState(false);
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);

  /** 安全释放上一个 Blob URL，防止内存泄漏 */
  const revokePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  // 组件卸载时释放 Blob URL + 卸载守卫
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; revokePreview(); };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLocating(true);
      setMessage('');
      setMood('');
      setPhoto(null);
      setPreview('');
      setLocation(null);
      setPrecise(false);
      setLocDenied(false);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocating(false);
          setLocDenied(false);
        },
        (err) => {
          setLocation({ lat: null, lng: null });
          setLocating(false);
          setLocDenied(err.code === 1); // PERMISSION_DENIED
        },
        { timeout: 15000, enableHighAccuracy: true }
      );
    }
  }, [isOpen]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
    setPhoto(compressed);
    revokePreview();
    const url = URL.createObjectURL(compressed);
    previewUrlRef.current = url;
    setPreview(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!location || location.lat == null) return;
    setLoading(true);
    const form = new FormData();
    form.append('lat', location.lat);
    form.append('lng', location.lng);
    form.append('message', message);
    if (mood) form.append('mood', mood);
    if (photo) form.append('photo', photo);
    form.append('precise', precise);

    try {
      await api.post('/api/checkin', form);
      setMessage('');
      setMood('');
      setPhoto(null);
      revokePreview();
      setPreview('');
      setLocation(null);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setMood('');
    setPhoto(null);
    revokePreview();
    setPreview('');
    setLocation(null);
    setPrecise(false);
    setLocDenied(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={handleClose} />
      <div className="relative w-full sm:max-w-md mx-0 sm:mx-auto pointer-events-auto
        aurora-glass rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 animate-slide-up
        max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white/90 flex items-center gap-2"
            style={{ fontFamily: 'var(--font-body)' }}>
            <div className="w-8 h-8 rounded-xl aurora-btn flex items-center justify-center"
              style={{ boxShadow: '0 0 20px var(--aurora-glow-teal)' }}>
              <MapPin className="w-4 h-4 text-white" />
            </div>
            Check In Here
          </h2>
          <button onClick={handleClose} className="p-1.5 hover:bg-white/[0.04] rounded-xl transition-colors">
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* Location status */}
        <div className={`mb-4 p-3 rounded-xl text-sm flex items-start gap-2
          ${locDenied
            ? 'bg-amber-400/5 border border-amber-400/10 text-amber-300'
            : 'bg-teal-400/5 border border-teal-400/10 text-teal-300'}`}>
          {locating ? (
            <Loader2 className="w-4 h-4 animate-spin mt-0.5" />
          ) : location?.lat ? (
            <>
              <MapPin className="w-4 h-4 text-blue-500 mt-0.5" />
              <span>{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>
            </>
          ) : locDenied ? (
            <>
              <MapPin className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-amber-300 font-medium">位置权限已关闭</p>
                <p className="text-amber-300/60 text-xs mt-0.5">请在浏览器设置 → 网站设置 → 位置 中开启</p>
              </div>
            </>
          ) : (
            <>
              <MapPin className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-red-400">Location unavailable</span>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Privacy toggle */}
          <div className="mb-4">
            <p className="text-xs text-white/30 mb-2" style={{ fontFamily: 'var(--font-body)' }}>定位精度</p>
            <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06]">
              <button
                type="button"
                onClick={() => setPrecise(false)}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all duration-300
                  ${!precise
                    ? 'bg-teal-400/10 border border-teal-400/40 text-teal-300 shadow-[0_0_15px_rgba(45,212,191,0.1)]'
                    : 'text-white/30 hover:text-white/50'
                  }`}
              >
                模糊定位
              </button>
              <button
                type="button"
                onClick={() => setPrecise(true)}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all duration-300
                  ${precise
                    ? 'bg-teal-400/10 border border-teal-400/40 text-teal-300 shadow-[0_0_15px_rgba(45,212,191,0.1)]'
                    : 'text-white/30 hover:text-white/50'
                  }`}
              >
                精确定位
              </button>
            </div>
          </div>

          {/* Message */}
          <textarea
            className="w-full p-3 aurora-input rounded-xl resize-none text-sm mb-4 h-24"
            placeholder="此刻在想什么？"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          {/* Mood selector */}
          <div className="mb-4">
            <p className="text-xs text-white/30 mb-2" style={{ fontFamily: 'var(--font-body)' }}>此刻心情？</p>
            <div className="flex gap-2">
              {['😊','😭','😋','🏋️','😴','🍺'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setMood(mood === emoji ? '' : emoji)}
                  className={`w-11 h-11 text-xl rounded-xl flex items-center justify-center transition-all duration-300
                    ${mood === emoji
                      ? 'bg-teal-400/10 border border-teal-400/40 scale-110 shadow-[0_0_15px_rgba(45,212,191,0.15)]'
                      : 'bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:scale-105'
                    }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Photo picker & preview */}
          <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} className="hidden" />
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl text-sm text-gray-600
                hover:bg-gray-200 transition-colors"
            >
              <Camera className="w-4 h-4" />
              {photo ? 'Change photo' : 'Add photo'}
            </button>
            {preview && (
              <img src={preview} className="w-12 h-12 rounded-lg object-cover border" />
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || locating || !location?.lat}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500
              text-white rounded-2xl font-semibold
              hover:shadow-lg hover:shadow-purple-500/25
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-300 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Post Footprint
          </button>
        </form>
      </div>
    </div>
  );
}
