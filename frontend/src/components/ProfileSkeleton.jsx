/**
 * ProfileDrawer 加载骨架屏。
 */
export default function ProfileSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      <div className="h-28 bg-gray-200" />
      <div className="relative px-5 h-10">
        <div className="absolute -top-10 w-20 h-20 rounded-full bg-gray-300 border-4 border-white" />
      </div>
      <div className="px-5 pt-2 pb-3">
        <div className="h-5 w-24 bg-gray-200 rounded" />
      </div>
      <div className="flex justify-around px-5 pb-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="h-4 w-10 bg-gray-200 rounded" />
            <div className="h-3 w-8 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="flex-1 px-5 space-y-3 overflow-hidden">
        <div className="h-3 w-16 bg-gray-200 rounded mt-3" />
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-gray-100 rounded-xl p-3 space-y-2">
            <div className="h-3 w-20 bg-gray-200 rounded" />
            <div className="h-3 w-32 bg-gray-200 rounded" />
            <div className="h-16 bg-gray-200 rounded-lg" />
            <div className="h-4 w-full bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
