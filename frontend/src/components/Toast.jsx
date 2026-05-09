/**
 * 固定于页面顶部中央的浮动提示框。
 * 收到新通知、用户上线/下线时弹出，几秒后自动消失。
 */
export default function Toast({ message, onDone }) {
  if (!message) return null;

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1900]
      px-5 py-3 bg-gray-900/90 backdrop-blur-md text-white text-sm font-medium
      rounded-2xl shadow-2xl shadow-black/20
      animate-slide-down flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-purple-400 flex-shrink-0" />
      {message}
    </div>
  );
}
