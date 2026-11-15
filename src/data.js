import { supabase } from "./supabase";

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, status, last_seen, bio, show_message_preview"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

export async function getFriends(userId) {
  const { data: friendshipRows, error: friendshipError } = await supabase
    .from("friends")
    .select("friend_id")
    .eq("user_id", userId);

  if (friendshipError) throw friendshipError;

  const friendIds = (friendshipRows || []).map((row) => row.friend_id);

  if (!friendIds.length) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, status, last_seen, bio")
    .in("id", friendIds)
    .order("username");

  if (error) throw error;

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

  const [{ data: users, error }, { data: friends, error: friendsError }, { data: requests, error: requestsError }] =
    await Promise.all([
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

  if (error) throw error;
  if (friendsError) throw friendsError;
  if (requestsError) throw requestsError;

  const friendIds = new Set((friends || []).map((item) => item.friend_id));
  const pendingIds = new Set((requests || []).map((item) => item.receiver_id));

  return (users || []).map((user) => ({
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
  const nextStatus = accepted ? "accepted" : "rejected";

  const { error: updateError } = await supabase
    .from("friend_requests")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("receiver_id", currentUserId);

  if (updateError) throw updateError;

  if (!accepted) return true;

  const createdAt = new Date().toISOString();

  // The original app stores friendship in both directions.
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
    // Best-effort compensation without changing the database structure.
    await supabase
      .from("friends")
      .delete()
      .eq("user_id", currentUserId)
      .eq("friend_id", senderId);

    throw secondError;
  }

  return true;
}

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

export async function markConversationRead(friendId) {
  const { error } = await supabase.rpc("mark_messages_as_read", {
    p_sender_id: friendId,
  });

  if (error) throw error;
}

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

        const belongsToConversation =
          (message.sender_id === userId &&
            message.receiver_id === friendId) ||
          (message.sender_id === friendId &&
            message.receiver_id === userId);

        if (belongsToConversation) callback(payload);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
