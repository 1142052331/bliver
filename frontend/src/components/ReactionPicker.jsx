import { useState, useRef } from 'react';
import { Heart } from 'lucide-react';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

export default function ReactionPicker({ fp, userId, onReact }) {
  const [showPicker, setShowPicker] = useState(false);
  const timerRef = useRef(null);

  const reactions = fp.reactions || [];
  const myReaction = reactions.find((r) => r.userId === userId);
  const reactionSummary = REACTION_EMOJIS
    .map((e) => {
      const count = reactions.filter((r) => r.emoji === e).length;
      return count > 0 ? { emoji: e, count } : null;
    })
    .filter(Boolean);

  const handleMouseEnter = () => {
    clearTimeout(timerRef.current);
    setShowPicker(true);
  };

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setShowPicker(false), 200);
  };

  const handleReact = (emoji) => {
    onReact(fp._id, emoji);
    setShowPicker(false);
  };

  const totalReactions = reactions.length;

  return (
    <div className="relative inline-flex flex-col items-start">
      {/* Emoji picker popup */}
      {showPicker && (
        <div
          className="absolute bottom-full left-0 mb-2 flex gap-1.5 p-2 bg-white rounded-xl shadow-lg border border-gray-200 z-50"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {REACTION_EMOJIS.map((emoji) => {
            const isMine = myReaction?.emoji === emoji;
            return (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className={`text-xl p-1.5 rounded-lg transition-all hover:scale-125 hover:bg-gray-100
                  ${isMine ? 'bg-blue-100 scale-110 ring-2 ring-blue-400' : ''}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}

      {/* Trigger button */}
      <div
        className="flex items-center gap-1.5"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          onClick={() => setShowPicker((v) => !v)}
          className={`flex items-center gap-1.5 transition-transform hover:scale-110
            ${myReaction ? 'text-red-500' : 'text-gray-400'}`}
        >
          {myReaction ? (
            <span className="text-lg leading-none">{myReaction.emoji}</span>
          ) : (
            <Heart className="w-5 h-5" />
          )}
          {totalReactions > 0 && (
            <span className="text-xs text-gray-500">{totalReactions}</span>
          )}
        </button>
      </div>

      {/* Reaction summary */}
      {reactionSummary.length > 0 && (
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {reactionSummary.map(({ emoji, count }) => (
            <span key={emoji} className="text-sm leading-none opacity-80" title={`${count}`}>
              {emoji}{count > 1 && <span className="text-xs text-gray-400 ml-0.5">{count}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
