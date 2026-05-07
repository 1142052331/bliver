import { MapPin, Users } from 'lucide-react';

export default function NavBar({ onlineCount }) {
  return (
    <nav className="absolute top-0 left-0 right-0 z-[1000] flex items-center justify-between px-5 py-3
      bg-white/75 backdrop-blur-md border-b border-gray-200/60 shadow-sm">
      <div className="flex items-center gap-2">
        <MapPin className="w-5 h-5 text-blue-600" />
        <span className="font-bold text-lg tracking-tight text-gray-800">Bliver</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 rounded-full px-3 py-1">
        <Users className="w-4 h-4 text-green-500" />
        <span>
          <span className="font-semibold text-gray-800">{onlineCount}</span> online
        </span>
      </div>
    </nav>
  );
}
