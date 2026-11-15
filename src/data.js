import { supabase } from "./supabase";

// -------------------- PROFILES --------------------

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, status, last_seen, bio, show_message_preview")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// -------------------- FRIENDS --------------------

export async function getFriends(userId) {
  const { data: rows, error } = await supabase
    .from("friends")
    .select("friend_id")
    .eq("user_id", userId);

  if (error) throw error;

  const ids = (rows || []).map((row) => row.friend_id);
  if (!ids.length) return [];

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, status, last_seen, bio")
    .in("id", ids)
    .order("username");

  if (profileError) throw profileError;
  return data || [];
}

export async function areFriends(userId, friendId) {
  const { data, error } = await supabase
    .from("friends")
    .select("friend_id")
    .eq("user_id", userId)
    .eq("friend_id", friendId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function searchUsers(userId, term) {
  const query = String(term || "").trim();
  if (query.length < 2) return [];

  const [usersResult, friendsResult, requestsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, status")
      .neq("id", userId)
      .ilike("username", `%${query}%`)
      .limit(20),

    supabase
      .from("friends")
      .select("friend_id")
      .eq("user_id", userId),

    supabase
      .from("friend_requests")
      .select("receiver_id")
      .eq("sender_id", userId)
      .eq("status", "pending"),
  ]);

  if (usersResult.error) throw usersResult.error;
  if (friendsResult.error) throw friendsResult.error;
  if (requestsResult.error) throw requestsResult.error;

  const friendIds = new Set(
    (friendsResult.data || []).map((item) => item.friend_id)
  );

  const pendingIds = new Set(
    (requestsResult.data || []).map((item) => item.receiver_id)
  );

  return (usersResult.data || []).map((user) => ({
    ...user,
    isFriend: friendIds.has(user.id),
    requestSent: pendingIds.has(user.id),
  }));
}

export async function sendFriendRequest(senderId, receiverId) {
  if (!senderId || !receiverId || senderId === receiverId) {
    throw new Error("Invalid friend request.");
  }

  const { error } = await supabase.from("friend_requests").insert({
    sender_id: senderId,
    receiver_id: receiverId,
    status: "pending",
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
  return true;
}

export async function getIncomingRequests(userId) {
  const { data: requests, error } = await supabase
    .from("friend_requests")
    .select("id, sender_id, created_at")
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!requests?.length) return [];

  const senderIds = requests.map((request) => request.sender_id);

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", senderIds);

  if (profileError) throw profileError;

  const profileMap = new Map(
    (profiles || []).map((profile) => [profile.id, profile])
  );

  return requests.map((request) => ({
    ...request,
    sender: profileMap.get(request.sender_id) || null,
  }));
}

export async function respondToFriendRequest(
  requestId,
  senderId,
  currentUserId,
  accepted
) {
  const { error: updateError } = await supabase
    .from("friend_requests")
    .update({
      status: accepted ? "accepted" : "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("receiver_id", currentUserId);

  if (updateError) throw updateError;
  if (!accepted) return true;

  const createdAt = new Date().toISOString();

  const { error: firstError } = await supabase.from("friends").insert({
    user_id: currentUserId,
    friend_id: senderId,
    created_at: createdAt,
  });

  if (firstError) throw firstError;

  const { error: secondError } = await supabase.from("friends").insert({
    user_id: senderId,
    friend_id: currentUserId,
    created_at: createdAt,
  });

  if (secondError) {
    await supabase
      .from("friends")
      .delete()
      .eq("user_id", currentUserId)
      .eq("friend_id", senderId);

    throw secondError;
  }

  return true;
}

// -------------------- TEXT MESSAGES --------------------

export async function getConversation(userId, friendId) {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*")
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`
    )
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function sendTextMessage(userId, friendId, content) {
  const message = String(content || "").trim();
  if (!message) throw new Error("Message cannot be empty.");

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: userId,
      receiver_id: friendId,
      content: message,
      chat_id: friendId,
      created_at: new Date().toISOString(),
      read: false,
      message_type: "text",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// -------------------- IMAGE MESSAGES --------------------

export async function sendImageMessage(userId, friendId, imageUrl, thumbnailUrl) {
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: userId,
      receiver_id: friendId,
      content: "",
      image_url: imageUrl,
      thumbnail_url: thumbnailUrl || imageUrl,
      created_at: new Date().toISOString(),
      message_type: "image",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// -------------------- AUDIO MESSAGES --------------------

export async function sendAudioMessage(userId, friendId, audioUrl, durationMs) {
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: userId,
      receiver_id: friendId,
      content: "",
      chat_id: friendId,
      created_at: new Date().toISOString(),
      read: false,
      message_type: "audio",
      audio_url: audioUrl,
      audio_duration_ms: Math.round(durationMs || 0),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// -------------------- READ RECEIPTS --------------------

export async function markConversationRead(friendId) {
  const { error } = await supabase.rpc("mark_messages_as_read", {
    p_sender_id: friendId,
  });

  if (error) throw error;
}

// -------------------- REACTIONS --------------------

export async function getMessageReactions(messageIds) {
  if (!messageIds?.length) return {};

  const { data, error } = await supabase
    .from("message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", messageIds);

  if (error) throw error;

  const result = {};

  (data || []).forEach((reaction) => {
    if (!result[reaction.message_id]) {
      result[reaction.message_id] = [];
    }

    result[reaction.message_id].push(reaction);
  });

  return result;
}

export async function toggleMessageReaction(messageId, userId, emoji) {
  const { data: existing, error: findError } = await supabase
    .from("message_reactions")
    .select("message_id, user_id, emoji")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) throw findError;

  if (existing?.emoji === emoji) {
    const { error } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("user_id", userId);

    if (error) throw error;
    return null;
  }

  if (existing) {
    const { error } = await supabase
      .from("message_reactions")
      .update({
        emoji,
        updated_at: new Date().toISOString(),
      })
      .eq("message_id", messageId)
      .eq("user_id", userId);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("message_reactions")
      .insert({
        message_id: messageId,
        user_id: userId,
        emoji,
      });

    if (error) throw error;
  }

  return { message_id: messageId, user_id: userId, emoji };
}

// -------------------- REALTIME --------------------

export function subscribeToConversation(userId, friendId, callback) {
  const channel = supabase
    .channel(`messages-${userId}-${friendId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "direct_messages",
      },
      (payload) => {
        const message = payload.new || payload.old;
        if (!message) return;

        const belongs =
          (message.sender_id === userId &&
            message.receiver_id === friendId) ||
          (message.sender_id === friendId &&
            message.receiver_id === userId);

        if (belongs) callback(payload);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeToReactions(callback) {
  const channel = supabase
    .channel("relaytalk-message-reactions")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "message_reactions",
      },
      callback
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
