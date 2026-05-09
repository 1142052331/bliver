import { Footprints, Heart, Clock } from 'lucide-react';

/**
 * Banner 区域的四个统计数字：足迹数、获赞数、活跃天数、连续打卡。
 */
export default function ProfileStats({ footprintCount, totalReactions, activeDays, streak }) {
  return (
    <div className="flex justify-around px-5 pb-3">
      <Stat icon={<Footprints className="w-3.5 h-3.5 text-blue-300" />} value={footprintCount} label="足迹" />
      <Stat icon={<Heart className="w-3.5 h-3.5 text-red-300" />} value={totalReactions} label="获赞" />
      <Stat icon={<Clock className="w-3.5 h-3.5 text-green-300" />} value={activeDays} label="活跃天数" />
      <Stat icon={<span className="text-base">🔥</span>} value={streak} label="连续打卡" />
    </div>
  );
}

function Stat({ icon, value, label }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-sm font-bold text-white drop-shadow-md">
        {icon}
        {value}
      </div>
      <p className="text-xs text-white/70 mt-0.5 drop-shadow-sm">{label}</p>
    </div>
  );
}
