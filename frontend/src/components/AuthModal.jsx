import { useState, useRef, useEffect } from 'react';
import imageCompression from 'browser-image-compression';
import api from '../api';
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
        const { data } = await api.post('/api/auth/register', form);
        saveAuth(data.user, data.token);
        if (rememberMe) saveCredentials(name.trim(), password);
        setAutoLogin(autoLoginCheck);
        onDone(data.user);
      } else {
        const { data } = await api.post('/api/auth/login', { name: name.trim(), password });
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
      ${isOverlay ? 'bg-black/50 backdrop-blur-sm pointer-events-auto' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[360px] max-w-[90vw] relative pointer-events-auto">
        {isOverlay && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}

        <div className="flex items-center justify-center mb-5">
          <MapPin className="w-9 h-9 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 text-center mb-1">Bliver</h1>
        <p className="text-sm text-gray-400 text-center mb-5">Location sharing with friends</p>

        {message && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 text-center">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
          <button
            onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'login' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
            }`}
          >Login</button>
          <button
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'register' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
            }`}
          >Register</button>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            className="w-full p-3 border border-gray-200 rounded-xl text-sm mb-3
              focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="Username"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="password"
            className="w-full p-3 border border-gray-200 rounded-xl text-sm mb-3
              focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
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
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl text-sm text-gray-600
                  hover:bg-gray-200 transition-colors"
              >
                <Camera className="w-4 h-4" />
                {avatar ? 'Change' : 'Avatar'}
              </button>
              {preview && <img src={preview} className="w-10 h-10 rounded-full object-cover border" />}
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
                <span className="text-sm text-gray-600">记住账号密码</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLoginCheck}
                  onChange={(e) => setAutoLoginCheck(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">自动登录</span>
              </label>
            </div>
          )}

          {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim() || !password}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500
              text-white rounded-2xl font-semibold
              hover:shadow-lg hover:shadow-purple-500/25
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
