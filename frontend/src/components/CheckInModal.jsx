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
  const fileRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setLocating(true);
      setMessage('');
      setMood('');
      setPhoto(null);
      setPreview('');
      setLocation(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocating(false);
        },
        () => {
          setLocation({ lat: null, lng: null });
          setLocating(false);
        }
      );
    }
  }, [isOpen]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920 });
    setPhoto(compressed);
    setPreview(URL.createObjectURL(compressed));
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

    try {
      await api.post('/api/checkin', form);
      setMessage('');
      setMood('');
      setPhoto(null);
      setPreview('');
      setLocation(null);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setMood('');
    setPhoto(null);
    setPreview('');
    setLocation(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={handleClose} />
      <div className="relative w-full sm:max-w-md mx-0 sm:mx-auto pointer-events-auto
        aurora-glass rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 animate-slide-up">
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
        <div className="mb-4 p-3 bg-teal-400/5 border border-teal-400/10 rounded-xl text-sm text-teal-300 flex items-center gap-2">
          {locating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : location?.lat ? (
            <>
              <MapPin className="w-4 h-4 text-blue-500" />
              {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
            </>
          ) : (
            <span className="text-red-500">Location unavailable</span>
          )}
        </div>

        <form onSubmit={handleSubmit}>
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
