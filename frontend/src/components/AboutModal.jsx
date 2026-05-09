import { useState, useEffect } from 'react';
import { X, MapPin, Layers, Radio, Database, Shield, Cloud, Smartphone, Globe, Zap, Heart } from 'lucide-react';

const techStack = [
  { label: 'React 18', desc: 'Hooks · Vite · Leaflet', icon: Layers, color: '#61dafb' },
  { label: 'Socket.IO', desc: '实时双向通信', icon: Radio, color: '#2dd4bf' },
  { label: 'Express', desc: 'REST API · 中间件', icon: Globe, color: '#a78bfa' },
  { label: 'MongoDB', desc: 'Mongoose ODM', icon: Database, color: '#4ade80' },
  { label: 'JWT', desc: 'Token 认证', icon: Shield, color: '#fbbf24' },
  { label: 'Cloudinary', desc: '图片云存储', icon: Cloud, color: '#38bdf8' },
];

const features = [
  { icon: MapPin, title: '地图打卡', desc: 'GPS 定位 + 心情表情 + 照片上传，每条足迹留下真实坐标与回忆' },
  { icon: Radio, title: '实时互动', desc: 'Socket.IO 驱动的点赞、评论、通知，朋友动态即时送达' },
  { icon: Shield, title: '隐私控制', desc: '模糊定位保护隐私，精确模式可选，坐标只有自己可见' },
  { icon: Smartphone, title: 'PWA 支持', desc: '可安装到手机主屏幕，iOS / Android 原生体验，后台推送通知' },
];

export default function AboutModal({ isOpen, onClose, user }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleViewProfile = () => {
    // 如果当前登录用户是阿森，使用他自己的 ID 打开主页
    if (user?._id) {
      window.dispatchEvent(new CustomEvent('profile:view', { detail: { userId: user._id } }));
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{ fontFamily: 'var(--font-body)' }}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Modal container — split into fixed header + scrollable body */}
      <div
        className={`relative w-full max-w-lg max-h-[85dvh] rounded-3xl flex flex-col
          transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]
          ${visible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}`}
        style={{
          background: 'linear-gradient(160deg, rgba(15,15,30,0.98), rgba(10,10,25,0.98))',
          boxShadow: '0 0 80px rgba(45,212,191,0.08), 0 0 40px rgba(139,92,246,0.06), 0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Ambient glow orbs */}
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.06) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)' }} />

        {/* Fixed header: title + X */}
        <div className="relative flex-shrink-0 flex items-start justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: 'rgba(45,212,191,0.08)',
                boxShadow: '0 0 20px rgba(45,212,191,0.10)',
              }}
            >
              <MapPin className="w-5 h-5" style={{ color: '#2dd4bf' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white/90 tracking-tight">Bliver</h1>
              <p className="text-[10px] text-white/25">地图朋友圈</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center
              hover:bg-white/[0.06] active:bg-white/[0.10] transition-colors"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="relative flex-1 overflow-y-auto about-scroll px-6 pb-6 space-y-5">
          {/* Creator */}
          <div
            className="text-center py-3 rounded-2xl"
            style={{ background: 'rgba(45,212,191,0.03)' }}
          >
            <p className="text-[10px] text-white/30">Designed & Developed by</p>
            <button
              type="button"
              onClick={handleViewProfile}
              className="text-sm font-semibold mt-0.5 transition-colors hover:underline underline-offset-4"
              style={{ color: '#2dd4bf' }}
            >
              阿森
            </button>
          </div>

          {/* Divider */}
          <Divider label="Tech Stack" />

          {/* Tech Stack Grid */}
          <div className="grid grid-cols-3 gap-2">
            {techStack.map((t, i) => (
              <div
                key={t.label}
                className="p-3 rounded-xl text-center"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  animation: visible ? `fadeIn 0.4s ease-out ${i * 60}ms both` : 'none',
                }}
              >
                <t.icon className="w-5 h-5 mx-auto mb-1.5" style={{ color: t.color }} />
                <p className="text-[11px] font-semibold text-white/70">{t.label}</p>
                <p className="text-[9px] text-white/25 mt-0.5 leading-tight">{t.desc}</p>
              </div>
            ))}
          </div>

          {/* Divider */}
          <Divider label="Features" />

          {/* Features */}
          <div className="space-y-2">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{
                  background: 'rgba(255,255,255,0.015)',
                  animation: visible ? `fadeIn 0.4s ease-out ${200 + i * 80}ms both` : 'none',
                }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(45,212,191,0.06)' }}>
                  <f.icon className="w-4 h-4" style={{ color: '#2dd4bf' }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white/70">{f.title}</p>
                  <p className="text-[11px] text-white/30 leading-relaxed mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Data Flow */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(45,212,191,0.02)' }}>
            <p className="text-[10px] text-white/25 uppercase tracking-widest mb-3 text-center">Data Flow</p>
            <div className="flex items-center justify-center gap-1 flex-wrap">
              {['Browser', 'Vite', 'React', 'Socket.IO', 'Express', 'MongoDB'].map((step, i) => (
                <div key={step} className="flex items-center gap-1"
                  style={{ animation: visible ? `fadeIn 0.3s ease-out ${400 + i * 80}ms both` : 'none' }}>
                  <span className="text-[10px] px-2 py-1 rounded-lg text-white/50"
                    style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {step}
                  </span>
                  {i < 5 && <Zap className="w-2.5 h-2.5 text-teal-400/20 flex-shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-[10px] text-white/12">
            Built with <Heart className="w-2.5 h-2.5 inline text-red-400/30" /> · 2026
          </p>
        </div>

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .about-scroll::-webkit-scrollbar { width: 4px; }
          .about-scroll::-webkit-scrollbar-track { background: transparent; }
          .about-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.04); border-radius: 4px; }
          .about-scroll:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); }
        `}</style>
      </div>
    </div>
  );
}

function Divider({ label }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-px bg-white/[0.04]" />
      <span className="text-[10px] text-white/15 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-white/[0.04]" />
    </div>
  );
}
