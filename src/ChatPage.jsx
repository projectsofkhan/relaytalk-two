
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "./supabase";
import {
  getConversation,
  getProfile,
  markConversationRead,
  sendTextMessage,
  subscribeToConversation
} from "./data";

function formatTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function ChatPage({ session }) {
  const { friendId } = useParams();
  const userId = session.user.id;

  const [friend, setFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end"
      });
    });
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe = null;

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        const [profile, conversation] = await Promise.all([
          getProfile(friendId),
          getConversation(userId, friendId)
        ]);

        if (!profile) {
          throw new Error("This user could not be found.");
        }

        if (profile.id === userId) {
          throw new Error("You cannot chat with yourself.");
        }

        if (!active) return;

        setFriend(profile);
        setMessages(conversation);

        await markConversationRead(friendId);

        unsubscribe = subscribeToConversation(
          userId,
          friendId,
          (message) => {
            if (!active) return;

            setMessages((current) => {
              if (current.some((item) => item.id === message.id)) {
                return current;
              }

              return [...current, message].sort(
                (a, b) =>
                  new Date(a.created_at) - new Date(b.created_at)
              );
            });

            if (message.receiver_id === userId) {
              markConversationRead(friendId);
            }
          },
          (updated) => {
            if (!active) return;

            setMessages((current) =>
              current.map((item) =>
                item.id === updated.id ? { ...item, ...updated } : item
              )
            );
          },
          (deleted) => {
            if (!active || !deleted?.id) return;

            setMessages((current) =>
              current.filter((item) => item.id !== deleted.id)
            );
          }
        );
      } catch (err) {
        if (active) setError(err.message || "Could not open this chat.");
      } finally {
        if (active) setLoading(false);
      }
    }

    initialize();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [friendId, userId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function handleSend(event) {
    event.preventDefault();

    const messageText = text.trim();
    if (!messageText || sending || !friend) return;

    setSending(true);
    setError("");

    try {
      const message = await sendTextMessage(
        userId,
        friendId,
        messageText
      );

      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) {
          return current;
        }

        return [...current, message];
      });

      setText("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err.message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="workspace-page chat-page">
      <div className="chat-page-heading">
        <Link to="/app/friends" className="back-link">
          ← Friends
        </Link>

        {friend && (
          <Link
            to={`/app/profile/${friend.id}`}
            className="chat-person"
          >
            <div className="user-avatar">
              {friend.avatar_url ? (
                <img src={friend.avatar_url} alt={friend.username} />
              ) : (
                (friend.username || "?").charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <strong>{friend.full_name || friend.username}</strong>
              <span>@{friend.username}</span>
            </div>
          </Link>
        )}
      </div>

      {error && <div className="workspace-error">{error}</div>}

      <section className="chat-panel">
        <div className="chat-messages">
          {loading ? (
            <div className="empty-panel">
              <p>Loading conversation...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-panel chat-empty">
              <span>✉</span>
              <strong>Say hello</strong>
              <p>This is the beginning of your conversation.</p>
            </div>
          ) : (
            messages.map((message) => {
              const mine = message.sender_id === userId;
              const deleted =
                message.deleted === true ||
                Boolean(message.deleted_at) ||
                message.content === "__DELETED__";

              return (
                <div
                  className={`message-line ${mine ? "message-mine" : "message-theirs"}`}
                  key={message.id}
                >
                  <div className="message-bubble">
                    {deleted ? (
                      <em>This message was deleted.</em>
                    ) : message.message_type === "text" ? (
                      message.content
                    ) : (
                      <em>
                        {message.message_type === "audio"
                          ? "Voice message"
                          : message.message_type === "call"
                            ? "Call event"
                            : "Unsupported message type"}
                      </em>
                    )}
                    <span className="message-time">
                      {formatTime(message.created_at)}
                      {mine && (
                        <span className="read-mark">
                          {message.read ? " · Read" : " · Sent"}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          <div ref={bottomRef} />
        </div>

        <form className="chat-composer" onSubmit={handleSend}>
          <input
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Write a message..."
            maxLength={10000}
            disabled={loading || !friend || sending}
            aria-label="Message"
          />
          <button
            className="send-button"
            type="submit"
            disabled={!text.trim() || sending || loading || !friend}
          >
            {sending ? "..." : "Send"}
          </button>
        </form>
      </section>
    </div>
  );
}
