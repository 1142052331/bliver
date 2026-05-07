import { useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import api from '../api';
import { saveAuth } from '../auth';
import { MapPin, Camera, Loader2 } from 'lucide-react';

export default function AuthModal({ onDone }) {
  const [tab, setTab] = useState('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 300 });
    setAvatar(compressed);
    setPreview(URL.createObjectURL(compressed));
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
        onDone(data.user);
      } else {
        const { data } = await api.post('/api/auth/login', { name: name.trim(), password });
        saveAuth(data.user, data.token);
        onDone(data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[360px] max-w-[90vw]">
        <div className="flex items-center justify-center mb-5">
          <MapPin className="w-9 h-9 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 text-center mb-1">Bliver</h1>
        <p className="text-sm text-gray-400 text-center mb-5">Location sharing with friends</p>

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

          {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim() || !password}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold
              hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tab === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
