import { useState, useRef, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import { apiClient } from '../api';
import { saveAuth, saveCredentials, getCredentials, setAutoLogin } from '../auth';
import { MapPin, Camera, Loader2, X } from 'lucide-react';

export default function AuthModal({ onDone, initialTab, message, onClose }) {
  const [tab, setTab] = useState(initialTab || 'login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [autoLoginCheck, setAutoLoginCheck] = useState(false);
  const fileRef = useRef(null);
  const previewUrlRef = useRef(null);

  const revokePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  useEffect(() => () => revokePreview(), []);

  // Sync tab and load saved credentials
  useEffect(() => {
    if (initialTab) setTab(initialTab);
    const cred = getCredentials();
    if (cred) {
      setName(cred.name);
      setPassword(cred.password);
      setRememberMe(true);
    }
  }, [initialTab]);

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
        saveAuth(data.user, data.token);
        if (rememberMe) saveCredentials(name.trim(), password);
        setAutoLogin(autoLoginCheck);
        onDone(data.user);
      } else {
        const { data } = await apiClient.auth.login({ name: name.trim(), password });
        saveAuth(data.user, data.token);
        if (rememberMe) saveCredentials(name.trim(), password);
        setAutoLogin(autoLoginCheck);
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
    <div className={`fixed inset-0 z-[3000] flex items-center justify-center
      ${isOverlay ? 'ios-backdrop pointer-events-auto' : 'ios-app-shell'}`}>
      <div className="ios-panel p-6 w-[380px] max-w-[92vw] relative pointer-events-auto">
        {isOverlay && (
          <button
            onClick={onClose}
            className="ios-icon-button absolute top-3 right-3 w-8 h-8 min-w-8"
          >
            <X className="w-4 h-4 text-gray-300" />
          </button>
        )}

        <div className="flex items-center justify-center mb-5">
          <div className="ios-primary w-12 h-12 rounded-full">
            <MapPin className="w-5 h-5" />
          </div>
        </div>
        <h1 className="text-xl font-extrabold text-white/92 text-center mb-1">Bliver</h1>
        <p className="text-sm text-white/46 text-center mb-5">Location sharing with friends</p>

        {message && (
          <div className="mb-4 p-3 bg-sky-400/12 border border-sky-300/20 rounded-[18px] text-sm text-sky-200 text-center">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="ios-segment flex rounded-full p-1 mb-5">
          <button
            onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'login' ? 'ios-segment-active' : 'text-white/45'
            }`}
          >Login</button>
          <button
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'register' ? 'ios-segment-active' : 'text-white/45'
            }`}
          >Register</button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            className="w-full p-3 aurora-input text-sm mb-3"
            placeholder="Username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="password"
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
                className="aurora-btn-glass flex items-center gap-2 px-4 py-2 rounded-full text-sm text-white/78"
              >
                <Camera className="w-4 h-4" />
                {avatar ? 'Change' : 'Avatar'}
              </button>
              {preview && <img src={preview} className="w-10 h-10 rounded-full object-cover border border-white/18" />}
            </div>
          )}

          {/* Remember me & Auto-login checkboxes (login tab only) */}
          {tab === 'login' && (
            <div className="space-y-2 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">记住账号密码</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLoginCheck}
                  onChange={(e) => setAutoLoginCheck(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">自动登录</span>
              </label>
            </div>
          )}

          {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim() || !password}
            className="ios-primary w-full py-3.5
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
  );
}
