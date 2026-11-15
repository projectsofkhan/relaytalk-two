const EMOJIS = ["❤️", "😂", "👍", "🔥", "😮", "😢"];

export default function MessageReactions({
  messageId,
  reactions = [],
  currentUserId,
  onReact,
}) {
  const counts = new Map();

  reactions.forEach((reaction) => {
    const current = counts.get(reaction.emoji) || {
      emoji: reaction.emoji,
      count: 0,
      mine: false,
    };

    current.count += 1;

    if (reaction.user_id === currentUserId) {
      current.mine = true;
    }

    counts.set(reaction.emoji, current);
  });

  return (
    <div className="message-reactions">
      {Array.from(counts.values()).map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`reaction-pill ${reaction.mine ? "mine" : ""}`}
          onClick={() => onReact(messageId, reaction.emoji)}
          title={`${reaction.count} reaction${reaction.count === 1 ? "" : "s"}`}
        >
          <span>{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}

      <div className="reaction-picker">
        <button
          type="button"
          className="reaction-add"
          title="Add reaction"
          aria-label="Add reaction"
        >
          +
        </button>

        <div className="reaction-picker-options">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(messageId, emoji)}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
