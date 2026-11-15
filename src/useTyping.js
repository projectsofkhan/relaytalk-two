import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export default function useTyping(currentUserId, friendId) {
  const [friendTyping, setFriendTyping] = useState(false);

  const channelRef = useRef(null);
  const timeoutRef = useRef(null);
  const sendTimeoutRef = useRef(null);
  const lastStatusRef = useRef(false);

  const channelName =
    currentUserId && friendId
      ? `typing:${[currentUserId, friendId].sort().join(":")}`
      : null;

  useEffect(() => {
    if (!channelName || !currentUserId || !friendId) return;

    let active = true;

    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "typing" }, (event) => {
        if (!active) return;

        const payload = event.payload;

        if (payload?.userId !== friendId) return;

        setFriendTyping(!!payload.isTyping);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        if (payload.isTyping) {
          timeoutRef.current = setTimeout(() => {
            if (active) setFriendTyping(false);
          }, 3500);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      active = false;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);

      channelRef.current = null;
      supabase.removeChannel(channel);
      setFriendTyping(false);
    };
  }, [channelName, currentUserId, friendId]);

  const sendTypingStatus = useCallback(
    async (isTyping) => {
      const channel = channelRef.current;

      if (!channel || !currentUserId) return;

      if (lastStatusRef.current === isTyping) return;

      lastStatusRef.current = isTyping;

      try {
        await channel.send({
          type: "broadcast",
          event: "typing",
          payload: {
            userId: currentUserId,
            isTyping,
          },
        });
      } catch (error) {
        console.warn("Typing status could not be sent:", error);
      }
    },
    [currentUserId]
  );

  const handleTyping = useCallback(() => {
    sendTypingStatus(true);

    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
    }

    sendTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(false);
    }, 2000);
  }, [sendTypingStatus]);

  const stopTyping = useCallback(() => {
    if (sendTimeoutRef.current) {
      clearTimeout(sendTimeoutRef.current);
    }

    sendTypingStatus(false);
  }, [sendTypingStatus]);

  return {
    friendTyping,
    handleTyping,
    stopTyping,
  };
}
