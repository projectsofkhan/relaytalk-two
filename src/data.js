import { supabase } from "./supabase";

// PROFILES

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, status, last_seen, bio, show_message_preview")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// FRIENDS

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

  const [users, friends, requests] = await Promise.all([
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

  if (users.error) throw users.error;
  if (friends.error) throw friends.error;
  if (requests.error) throw requests.error;

  const friendIds = new Set((friends.data || []).map((x) => x.friend_id));
  const pendingIds = new Set((requests.data || []).map((x) => x.receiver_id));

  return (users.data || []).map((user) => ({
    ...user,
    isFriend: friendIds.has(user.id),
    requestSent: pendingIds.has(user.id),
  }));
}

export async function sendFriendRequest(senderId, receiverId) {
  if (!senderId || !receiverId || senderId === receiverId) {
    throw new Error("Invalid friend request.");
  }

  const { data: existing, error: checkError } = await supabase
    .from("friend_requests")
    .select("id")
    .eq("sender_id", senderId)
    .eq("receiver_id", receiverId)
    .eq("status", "pending")
    .maybeSingle();

  if (checkError) throw checkError;
  if (existing) throw new Error("Friend request already sent.");

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

  const ids = requests.map((request) => request.sender_id);

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", ids);

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
  const { error } = await supabase
    .from("friend_requests")
    .update({
      status: accepted ? "accepted" : "rejected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("receiver_id", currentUserId);

  if (error) throw error;
  if (!accepted) return true;

  const { error: firstError } = await supabase.from("friends").upsert(
    [
      { user_id: senderId, friend_id: currentUserId },
      { user_id: currentUserId, friend_id: senderId },
    ],
    { onConflict: "user_id,friend_id" }
  );

  if (firstError) throw firstError;
  return true;
}

// CONVERSATIONS

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

// EDIT MESSAGE

export async function editTextMessage(messageId, userId, newContent) {
  const content = String(newContent || "").trim();

  if (!content) throw new Error("Message cannot be empty.");

  const { data, error } = await supabase
    .from("direct_messages")
    .update({
      content,
      edited_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("sender_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// DELETE MESSAGE

export async function deleteMessage(messageId, userId) {
  const deletedAt = new Date().toISOString();

  const { error: reactionError } = await supabase
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId);

  if (reactionError) throw reactionError;

  const { data, error } = await supabase
    .from("direct_messages")
    .update({
      content: "__DELETED__",
      image_url: null,
      thumbnail_url: null,
      audio_url: null,
      audio_duration_ms: null,
      color: null,
      edited_at: deletedAt,
    })
    .eq("id", messageId)
    .eq("sender_id", userId)
    .select()
    .single();

  if (error) throw error;

  // Match the original application's deleted flag behaviour.
  await supabase
    .from("direct_messages")
    .update({ deleted: true })
    .eq("id", messageId)
    .eq("sender_id", userId);

  return data;
}

// READ RECEIPTS

export async function markConversationRead(friendId) {
  const { error } = await supabase.rpc("mark_messages_as_read", {
    p_sender_id: friendId,
  });

  if (error) throw error;
}

// REACTIONS

export async function getMessageReactions(messageIds) {
  if (!messageIds?.length) return {};

  const { data, error } = await supabase
    .from("message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", messageIds);

  if (error) throw error;

  const result = {};

  (data || []).forEach((reaction) => {
    if (!result[reaction.message_id]) result[reaction.message_id] = [];
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
      .update({ emoji })
      .eq("message_id", messageId)
      .eq("user_id", userId);

    if (error) throw error;
  } else {
    const { error } = await supabase.from("message_reactions").insert({
      message_id: messageId,
      user_id: userId,
      emoji,
    });

    if (error) throw error;
  }

  return { message_id: messageId, user_id: userId, emoji };
}

// REALTIME

export function subscribeToConversation(userId, friendId, callback) {
  const channel = supabase
    .channel(`messages-${userId}-${friendId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "direct_messages" },
      (payload) => {
        const message = payload.new || payload.old;
        if (!message) return;

        const belongs =
          (message.sender_id === userId && message.receiver_id === friendId) ||
          (message.sender_id === friendId && message.receiver_id === userId);

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
      { event: "*", schema: "public", table: "message_reactions" },
      callback
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
