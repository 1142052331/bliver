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
  { icon: Shield, title: '隐私控制', desc: '模糊定位保护隐私，精确模式可选，管理员可查看真实坐标' },
  { icon: Smartphone, title: 'PWA 支持', desc: '可安装到手机主屏幕，iOS / Android 原生体验，后台推送通知' },
];

export default function AboutModal({ isOpen, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{ fontFamily: 'var(--font-body)' }}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-lg max-h-[85dvh] overflow-y-auto
          rounded-3xl p-6
          transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]
          ${visible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}`}
        style={{
          background: 'linear-gradient(160deg, rgba(15,15,30,0.98), rgba(10,10,25,0.98))',
          border: '1px solid rgba(45,212,191,0.12)',
          boxShadow: '0 0 80px rgba(45,212,191,0.08), 0 0 40px rgba(139,92,246,0.06), 0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Ambient glow orbs */}
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.06) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)' }} />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/[0.04] transition-colors z-10"
        >
          <X className="w-4 h-4 text-white/30" />
        </button>

        {/* Header */}
        <div className="relative z-10 text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
            style={{
              background: 'rgba(45,212,191,0.08)',
              border: '1px solid rgba(45,212,191,0.15)',
              boxShadow: '0 0 30px rgba(45,212,191,0.12)',
            }}
          >
            <MapPin className="w-7 h-7" style={{ color: '#2dd4bf' }} />
          </div>
          <h1 className="text-xl font-bold text-white/90 tracking-tight">Bliver</h1>
          <p className="text-xs text-white/30 mt-1">地图朋友圈 · 足迹分享平台</p>
        </div>

        {/* Creator */}
        <div className="relative z-10 text-center mb-6 px-4 py-3 rounded-2xl"
          style={{ background: 'rgba(45,212,191,0.03)', border: '1px solid rgba(45,212,191,0.06)' }}>
          <p className="text-xs text-white/40">Designed & Developed by</p>
          <p className="text-sm font-semibold text-white/80 mt-0.5">阿森</p>
        </div>

        {/* Divider */}
        <div className="relative z-10 flex items-center gap-2 mb-5">
          <div className="flex-1 h-px bg-white/[0.04]" />
          <span className="text-[10px] text-white/20 uppercase tracking-widest">Tech Stack</span>
          <div className="flex-1 h-px bg-white/[0.04]" />
        </div>

        {/* Tech Stack Grid */}
        <div className="relative z-10 grid grid-cols-3 gap-2 mb-6">
          {techStack.map((t, i) => (
            <div
              key={t.label}
              className="p-3 rounded-xl text-center transition-all duration-500"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)',
                animationDelay: `${i * 60}ms`,
                animation: visible ? `fadeIn 0.5s ease-out ${i * 60}ms both` : 'none',
              }}
            >
              <t.icon className="w-5 h-5 mx-auto mb-1.5" style={{ color: t.color }} />
              <p className="text-[11px] font-semibold text-white/70">{t.label}</p>
              <p className="text-[9px] text-white/25 mt-0.5 leading-tight">{t.desc}</p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="relative z-10 flex items-center gap-2 mb-5">
          <div className="flex-1 h-px bg-white/[0.04]" />
          <span className="text-[10px] text-white/20 uppercase tracking-widest">Features</span>
          <div className="flex-1 h-px bg-white/[0.04]" />
        </div>

        {/* Features */}
        <div className="relative z-10 space-y-2 mb-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="flex items-start gap-3 p-3 rounded-xl transition-all duration-500"
              style={{
                background: 'rgba(255,255,255,0.015)',
                border: '1px solid rgba(255,255,255,0.03)',
                animation: visible ? `fadeIn 0.5s ease-out ${200 + i * 80}ms both` : 'none',
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
        <div className="relative z-10 rounded-2xl p-4 mb-4"
          style={{ background: 'rgba(45,212,191,0.02)', border: '1px solid rgba(45,212,191,0.05)' }}>
          <p className="text-[10px] text-white/25 uppercase tracking-widest mb-3 text-center">Data Flow</p>
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {['Browser', 'Vite', 'React', 'Socket.IO', 'Express', 'MongoDB'].map((step, i) => (
              <div key={step} className="flex items-center gap-1"
                style={{ animation: visible ? `fadeIn 0.4s ease-out ${400 + i * 80}ms both` : 'none' }}>
                <span className="text-[10px] px-2 py-1 rounded-lg text-white/50"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {step}
                </span>
                {i < 5 && <Zap className="w-2.5 h-2.5 text-teal-400/30 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-center text-[10px] text-white/15">
          Built with <Heart className="w-2.5 h-2.5 inline text-red-400/40" /> · 2026
        </p>

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  );
}
