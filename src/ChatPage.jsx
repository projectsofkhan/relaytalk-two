import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Send, LoaderCircle } from "lucide-react";
import {
  areFriends,
  getConversation,
  getProfile,
  markConversationRead,
  sendTextMessage,
  subscribeToConversation,
} from "./data";

export default function ChatPage({ session }) {
  const { userId: friendId } = useParams();
  const currentUserId = session?.user?.id;

  const [friend, setFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef(null);

  const loadMessages = useCallback(async () => {
    if (!currentUserId || !friendId) return;

    const conversation = await getConversation(currentUserId, friendId);
    setMessages(conversation);

    try {
      await markConversationRead(friendId);
    } catch (readError) {
      console.warn("Unable to mark messages as read:", readError);
    }
  }, [currentUserId, friendId]);

  useEffect(() => {
    let active = true;
    let unsubscribe = null;

    async function initialise() {
      setLoading(true);
      setError("");

      try {
        if (!currentUserId || !friendId) {
          throw new Error("This conversation is unavailable.");
        }

        const friendshipExists = await areFriends(
          currentUserId,
          friendId
        );

        if (!friendshipExists) {
          throw new Error("You can only chat with an accepted friend.");
        }

        const profile = await getProfile(friendId);
        if (!profile) throw new Error("This user could not be found.");

        const conversation = await getConversation(
          currentUserId,
          friendId
        );

        if (!active) return;

        setFriend(profile);
        setMessages(conversation);

        try {
          await markConversationRead(friendId);
        } catch (readError) {
          console.warn("Unable to mark messages as read:", readError);
        }

        unsubscribe = subscribeToConversation(
          currentUserId,
          friendId,
          (payload) => {
            if (!active) return;

            if (payload.eventType === "DELETE") {
              setMessages((previous) =>
                previous.filter((item) => item.id !== payload.old?.id)
              );
              return;
            }

            const incoming = payload.new;
            if (!incoming) return;

            setMessages((previous) => {
              const exists = previous.some(
                (item) => item.id === incoming.id
              );

              if (exists) {
                return previous.map((item) =>
                  item.id === incoming.id ? incoming : item
                );
              }

              return [...previous, incoming].sort(
                (a, b) =>
                  new Date(a.created_at) - new Date(b.created_at)
              );
            });

            if (incoming.receiver_id === currentUserId) {
              markConversationRead(friendId).catch(console.warn);
            }
          }
        );
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    initialise();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [currentUserId, friendId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(event) {
    event.preventDefault();

    const messageText = text.trim();
    if (!messageText || sending || !friend) return;

    setSending(true);
    setError("");

    try {
      const sentMessage = await sendTextMessage(
        currentUserId,
        friendId,
        messageText
      );

      setMessages((previous) => {
        if (previous.some((item) => item.id === sentMessage.id)) {
          return previous;
        }

        return [...previous, sentMessage];
      });

      setText("");
    } catch (sendError) {
      setError(sendError.message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <LoaderCircle className="spin" size={25} />
        <span>Opening conversation...</span>
      </div>
    );
  }

  if (error && !friend) {
    return (
      <section className="page-error">
        <p>{error}</p>
        <Link to="/app/friends">Back to friends</Link>
      </section>
    );
  }

  return (
    <section className="chat-page">
      <header className="chat-header">
        <Link
          to="/app/friends"
          className="icon-button"
          aria-label="Back to friends"
        >
          <ArrowLeft size={20} />
        </Link>

        <div className="chat-person">
          <div className="avatar">
            {friend?.avatar_url ? (
              <img src={friend.avatar_url} alt="" />
            ) : (
              friend?.username?.[0]?.toUpperCase() || "?"
            )}
          </div>

          <div>
            <strong>{friend?.username || "User"}</strong>
            <span>{friend?.status === "online" ? "Online" : "RelayTalk"}</span>
          </div>
        </div>
      </header>

      <div className="messages-list">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <strong>Start a conversation</strong>
            <p>Send your first message to {friend?.username}.</p>
          </div>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === currentUserId;
            const deleted =
              message.deleted === true ||
              message.deleted_at ||
              message.content === "__DELETED__";

            return (
              <article
                key={message.id}
                className={`message-row ${mine ? "mine" : "theirs"}`}
              >
                <div className="message-bubble">
                  {deleted ? (
                    <em>This message was deleted.</em>
                  ) : message.message_type === "audio" && message.audio_url ? (
                    <audio controls src={message.audio_url} />
                  ) : (
                    message.content
                  )}
                  <time>
                    {message.created_at
                      ? new Date(message.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                    {mine && message.read ? " · Read" : ""}
                  </time>
                </div>
              </article>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="inline-error">{error}</p>}

      <form className="message-composer" onSubmit={handleSend}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a message..."
          aria-label="Message"
          maxLength={5000}
        />

        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Send message"
        >
          {sending ? (
            <LoaderCircle className="spin" size={19} />
          ) : (
            <Send size={19} />
          )}
        </button>
      </form>
    </section>
  );
}
