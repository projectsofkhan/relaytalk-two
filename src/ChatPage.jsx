import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ImagePlus,
  Send,
  LoaderCircle,
} from "lucide-react";

import {
  areFriends,
  getConversation,
  getMessageReactions,
  getProfile,
  markConversationRead,
  sendTextMessage,
  sendImageMessage,
  sendAudioMessage,
  toggleMessageReaction,
  editTextMessage,
  deleteMessage,
  subscribeToConversation,
  subscribeToReactions,
} from "./data";

import {
  uploadImageToImgBB,
  uploadAudioToCloudinary,
} from "./chat-media";

import useTyping from "./useTyping";
import VoiceRecorder from "./VoiceRecorder";
import MessageBubble from "./MessageBubble";
import "./chat-features.css";
import "./typing.css";

export default function ChatPage({ session }) {
  const { userId: friendId } = useParams();
  const currentUserId = session?.user?.id;

  const [friend, setFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState({});
  const [text, setText] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const messagesRef = useRef([]);

  const {
    friendTyping,
    handleTyping,
    stopTyping,
  } = useTyping(currentUserId, friendId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadReactions = useCallback(async (conversation) => {
    const ids = conversation
      .filter((message) => message.message_type !== "call")
      .map((message) => message.id);

    const result = await getMessageReactions(ids);
    setReactions(result);
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribeMessages = null;
    let unsubscribeReactions = null;

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

        const [profile, conversation] = await Promise.all([
          getProfile(friendId),
          getConversation(currentUserId, friendId),
        ]);

        if (!profile) {
          throw new Error("This user could not be found.");
        }

        if (!active) return;

        setFriend(profile);
        setMessages(conversation);

        try {
          await loadReactions(conversation);
        } catch (reactionError) {
          console.warn("Could not load reactions:", reactionError);
        }

        try {
          await markConversationRead(friendId);
        } catch (readError) {
          console.warn("Could not mark messages read:", readError);
        }

        unsubscribeMessages = subscribeToConversation(
          currentUserId,
          friendId,
          (payload) => {
            if (!active) return;

            const incoming = payload.new || payload.old;
            if (!incoming) return;

            if (payload.eventType === "DELETE") {
              setMessages((previous) =>
                previous.filter((item) => item.id !== incoming.id)
              );

              setReactions((previous) => {
                const next = { ...previous };
                delete next[incoming.id];
                return next;
              });

              return;
            }

            if (payload.eventType === "UPDATE") {
              setMessages((previous) =>
                previous.map((item) =>
                  item.id === incoming.id
                    ? { ...item, ...incoming }
                    : item
                )
              );

              if (
                incoming.content === "__DELETED__" ||
                incoming.deleted === true
              ) {
                setReactions((previous) => {
                  const next = { ...previous };
                  delete next[incoming.id];
                  return next;
                });
              }

              return;
            }

            if (payload.eventType === "INSERT") {
              setMessages((previous) => {
                if (previous.some((item) => item.id === incoming.id)) {
                  return previous;
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
          }
        );

        unsubscribeReactions = subscribeToReactions((payload) => {
          if (!active) return;

          const reaction = payload.new || payload.old;
          if (!reaction?.message_id) return;

          const belongs = messagesRef.current.some(
            (message) => message.id === reaction.message_id
          );

          if (!belongs) return;

          setReactions((previous) => {
            const next = { ...previous };
            const current = [...(next[reaction.message_id] || [])];

            if (payload.eventType === "INSERT") {
              if (
                !current.some(
                  (item) =>
                    item.user_id === reaction.user_id &&
                    item.emoji === reaction.emoji
                )
              ) {
                current.push(reaction);
              }
            } else if (payload.eventType === "DELETE") {
              const index = current.findIndex(
                (item) => item.user_id === reaction.user_id
              );

              if (index !== -1) current.splice(index, 1);
            } else if (payload.eventType === "UPDATE") {
              const index = current.findIndex(
                (item) => item.user_id === reaction.user_id
              );

              if (index !== -1) current[index] = reaction;
              else current.push(reaction);
            }

            next[reaction.message_id] = current;
            return next;
          });
        });
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    initialise();

    return () => {
      active = false;
      unsubscribeMessages?.();
      unsubscribeReactions?.();
    };
  }, [currentUserId, friendId, loadReactions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  async function handleSendText(event) {
    event.preventDefault();

    const messageText = text.trim();
    if (!messageText || sending || !friend) return;

    setSending(true);
    setError("");
    stopTyping();

    try {
      const message = await sendTextMessage(
        currentUserId,
        friendId,
        messageText
      );

      setMessages((previous) => {
        if (previous.some((item) => item.id === message.id)) {
          return previous;
        }

        return [...previous, message];
      });

      setText("");
    } catch (sendError) {
      setError(sendError.message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function handleImages(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length || uploadingImages) return;

    const validFiles = files.filter(
      (file) =>
        file.type.startsWith("image/") &&
        file.size <= 20 * 1024 * 1024
    );

    if (!validFiles.length) {
      setError("Select an image smaller than 20 MB.");
      return;
    }

    setUploadingImages(true);
    setError("");

    let successful = 0;
    const failures = [];

    try {
      for (const file of validFiles.slice(0, 10)) {
        try {
          const uploaded = await uploadImageToImgBB(file);

          const message = await sendImageMessage(
            currentUserId,
            friendId,
            uploaded.imageUrl,
            uploaded.thumbnailUrl
          );

          setMessages((previous) => {
            if (previous.some((item) => item.id === message.id)) {
              return previous;
            }

            return [...previous, message];
          });

          successful += 1;
        } catch (uploadError) {
          failures.push(uploadError.message);
        }
      }

      if (failures.length) {
        setError(
          `${successful} image(s) sent. ${failures.length} image(s) failed.`
        );
      }
    } finally {
      setUploadingImages(false);
    }
  }

  async function handleSendVoice(blob, duration) {
    const uploaded = await uploadAudioToCloudinary(blob);

    const message = await sendAudioMessage(
      currentUserId,
      friendId,
      uploaded.url,
      duration
    );

    setMessages((previous) => {
      if (previous.some((item) => item.id === message.id)) {
        return previous;
      }

      return [...previous, message];
    });
  }

  async function handleReaction(messageId, emoji) {
    const target = messages.find((item) => item.id === messageId);

    if (
      !target ||
      target.content === "__DELETED__" ||
      target.deleted ||
      target.message_type === "audio" ||
      target.message_type === "call" ||
      target.image_url
    ) {
      return;
    }

    try {
      const updated = await toggleMessageReaction(
        messageId,
        currentUserId,
        emoji
      );

      setReactions((previous) => {
        const current = [...(previous[messageId] || [])];

        const existingIndex = current.findIndex(
          (item) => item.user_id === currentUserId
        );

        if (existingIndex !== -1) {
          current.splice(existingIndex, 1);
        }

        if (updated) current.push(updated);

        return {
          ...previous,
          [messageId]: current,
        };
      });
    } catch (reactionError) {
      setError(reactionError.message || "Could not save reaction.");
    }
  }

  async function handleEdit(messageId, newContent) {
    try {
      const updated = await editTextMessage(
        messageId,
        currentUserId,
        newContent
      );

      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId ? { ...message, ...updated } : message
        )
      );
    } catch (editError) {
      setError(editError.message || "Could not edit message.");
      throw editError;
    }
  }

  async function handleDelete(messageId) {
    try {
      const updated = await deleteMessage(messageId, currentUserId);

      setMessages((previous) =>
        previous.map((message) =>
          message.id === messageId ? { ...message, ...updated } : message
        )
      );

      setReactions((previous) => {
        const next = { ...previous };
        delete next[messageId];
        return next;
      });
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete message.");
      throw deleteError;
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
            <span>
              {friendTyping
                ? "typing..."
                : friend?.status === "online"
                  ? "Online"
                  : "RelayTalk"}
            </span>
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
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              currentUserId={currentUserId}
              reactions={reactions[message.id] || []}
              onReact={handleReaction}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}

        {friendTyping && (
          <div className="typing-indicator">
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
            <span>{friend?.username || "Friend"} is typing...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && <p className="inline-error">{error}</p>}

      <form className="message-composer" onSubmit={handleSendText}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleImages}
        />

        <button
          type="button"
          className="composer-attachment"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImages || sending}
          aria-label="Attach images"
          title="Attach images"
        >
          {uploadingImages ? (
            <LoaderCircle className="spin" size={19} />
          ) : (
            <ImagePlus size={19} />
          )}
        </button>

        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            handleTyping();
          }}
          onBlur={stopTyping}
          placeholder="Write a message..."
          aria-label="Message"
          maxLength={5000}
        />

        <VoiceRecorder
          onSend={handleSendVoice}
          disabled={sending || uploadingImages}
        />

        <button
          type="submit"
          disabled={!text.trim() || sending || uploadingImages}
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
