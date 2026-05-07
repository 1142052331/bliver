import { useState, useRef, useEffect } from 'react';
import api from '../api';
import imageCompression from 'browser-image-compression';
import { X, MapPin, Camera, Loader2 } from 'lucide-react';

export default function CheckInModal({ isOpen, onClose }) {
  const [message, setMessage] = useState('');
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
    if (photo) form.append('photo', photo);

    try {
      await api.post('/api/checkin', form);
      setMessage('');
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
    setPhoto(null);
    setPreview('');
    setLocation(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full sm:max-w-md mx-0 sm:mx-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            Check In Here
          </h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Location status */}
        <div className="mb-4 p-3 bg-blue-50 rounded-xl text-sm text-blue-700 flex items-center gap-2">
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
            className="w-full p-3 border border-gray-200 rounded-xl resize-none text-sm mb-4 h-24
              focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

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
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold
              hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Post Footprint
          </button>
        </form>
      </div>
    </div>
  );
}
