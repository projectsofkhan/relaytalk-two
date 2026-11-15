import MessageReactions from "./MessageReactions";

export default function MessageBubble({
  message,
  currentUserId,
  reactions = [],
  onReact,
}) {
  const mine = message.sender_id === currentUserId;

  const deleted =
    message.deleted === true ||
    !!message.deleted_at ||
    message.content === "__DELETED__";

  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  function openImage() {
    if (message.image_url) {
      window.open(message.image_url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <article className={`message-row ${mine ? "mine" : "theirs"}`}>
      <div className="message-content-column">
        <div className="message-bubble">
          {deleted ? (
            <em className="deleted-message">
              This message was deleted.
            </em>
          ) : message.message_type === "image" || message.image_url ? (
            <button
              type="button"
              className="shared-image-button"
              onClick={openImage}
              aria-label="Open shared image"
            >
              <img
                src={message.thumbnail_url || message.image_url}
                alt="Shared image"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.src = message.image_url;
                }}
              />
            </button>
          ) : message.message_type === "audio" || message.audio_url ? (
            <audio
              className="voice-message-audio"
              controls
              preload="metadata"
              src={message.audio_url}
            />
          ) : (
            <span>{message.content}</span>
          )}

          <time>
            {time}
            {mine && message.read ? " · Read" : ""}
          </time>
        </div>

        {!deleted &&
          message.message_type !== "audio" &&
          message.message_type !== "call" &&
          !message.audio_url && (
            <MessageReactions
              messageId={message.id}
              reactions={reactions}
              currentUserId={currentUserId}
              onReact={onReact}
            />
          )}
      </div>
    </article>
  );
}
