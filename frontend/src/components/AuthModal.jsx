// @feature 登录注册弹窗 | Auth Modal | AuthModal
import { useState, useRef, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import { apiClient } from '../api';
import { saveAuth } from '../auth';
import { MapPin, Camera, Loader2, X } from 'lucide-react';
import useDialogFocusTrap from '../hooks/useDialogFocusTrap';

export default function AuthModal({ onDone, initialTab, message, onClose, reserveMobileNavigation = false }) {
  const [tab, setTab] = useState(initialTab || 'login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberSession, setRememberSession] = useState(false);
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);
  const dialogRef = useRef(null);
  useDialogFocusTrap(dialogRef, true, onClose);

  const revokePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  useEffect(() => () => revokePreview(), []);

  const handleAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 300 });
    setAvatar(compressed);
    revokePreview();
    const url = URL.createObjectURL(compressed);
    previewUrlRef.current = url;
    setPreview(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setLoading(true);
    setError('');

    try {
      if (tab === 'register') {
        const form = new FormData();
        form.append('name', name.trim());
        form.append('password', password);
        if (avatar) form.append('avatar', avatar);
        const { data } = await apiClient.auth.register(form);
        saveAuth(data.user, data.token, { persistent: rememberSession });
        onDone(data.user);
      } else {
        const { data } = await apiClient.auth.login({ name: name.trim(), password });
        saveAuth(data.user, data.token, { persistent: rememberSession });
        onDone(data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const isOverlay = !!onClose;

  return (
    <div
      className={`fixed inset-0 z-[3000] overflow-y-auto overscroll-contain p-3
        ${reserveMobileNavigation ? 'bliver-destination-auth-surface' : ''}
        ${isOverlay ? 'ios-backdrop pointer-events-auto' : 'ios-app-shell'}`}
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          aria-describedby="auth-modal-description"
          tabIndex={-1}
          className="ios-panel relative my-auto max-h-[calc(100dvh-1.5rem)] w-[380px]
            max-w-[92vw] overflow-y-auto p-6 pointer-events-auto"
          style={{
            maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.5rem)',
          }}
        >
        {isOverlay && (
          <button
            type="button"
            aria-label="Close authentication dialog"
            onClick={onClose}
            className="ios-icon-button absolute top-3 right-3 w-11 h-11 min-w-11 min-h-11"
          >
            <X className="w-4 h-4 text-gray-300" />
          </button>
        )}

        <div className="flex items-center justify-center mb-5">
          <div className="ios-primary w-12 h-12 rounded-full">
            <MapPin className="w-5 h-5" />
          </div>
        </div>
        <h1 id="auth-modal-title" className="text-xl font-extrabold text-white/92 text-center mb-1">Bliver</h1>
        <p id="auth-modal-description" className="text-sm text-white/46 text-center mb-5">Location sharing with friends</p>

        {message && (
          <div className="mb-4 p-3 bg-sky-400/12 border border-sky-300/20 rounded-[18px] text-sm text-sky-200 text-center">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="ios-segment flex rounded-full p-1 mb-5">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 min-h-11 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'login' ? 'ios-segment-active' : 'text-white/45'
            }`}
          >Login</button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 min-h-11 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'register' ? 'ios-segment-active' : 'text-white/45'
            }`}
          >Register</button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="auth-username" className="sr-only">Username</label>
          <input
            id="auth-username"
            data-dialog-initial-focus
            autoComplete="username"
            className="w-full p-3 aurora-input text-sm mb-3"
            placeholder="Username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor="auth-password" className="sr-only">Password</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
            className="w-full p-3 aurora-input text-sm mb-3"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {/* Avatar for register */}
          {tab === 'register' && (
            <div className="flex items-center gap-3 mb-3">
              <input type="file" accept="image/*" ref={fileRef} onChange={handleAvatar} className="hidden" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="aurora-btn-glass flex min-h-11 items-center gap-2 px-4 py-2 rounded-full text-sm text-white/78"
              >
                <Camera className="w-4 h-4" />
                {avatar ? 'Change' : 'Avatar'}
              </button>
              {preview && <img src={preview} alt="" className="w-10 h-10 rounded-full object-cover border border-white/18" />}
            </div>
          )}

          <div className="mb-3">
            <label className="flex min-h-11 items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(e) => setRememberSession(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300">保持登录</span>
            </label>
          </div>

          {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim() || !password}
            className="ios-primary w-full min-h-11 py-3.5
              rounded-full font-extrabold
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-300 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tab === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}
