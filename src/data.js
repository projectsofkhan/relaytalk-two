
import { supabase } from "./supabase";

export async function getFriends(userId) {
  const { data: relations, error: relationError } = await supabase
    .from("friends")
    .select("friend_id, created_at")
    .eq("user_id", userId);

  if (relationError) throw relationError;

  const ids = (relations || []).map((item) => item.friend_id);
  if (!ids.length) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, status, last_seen, bio")
    .in("id", ids)
    .order("username");

  if (profileError) throw profileError;

  return (profiles || []).map((profile) => ({
    ...profile,
    friendship_created_at:
      relations.find((item) => item.friend_id === profile.id)?.created_at
  }));
}

export async function searchUsers(userId, term) {
  const cleanTerm = term.trim();

  if (cleanTerm.length < 2) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, status")
    .neq("id", userId)
    .ilike("username", `%${cleanTerm}%`)
    .limit(20);

  if (error) throw error;

  const users = data || [];
  if (!users.length) return [];

  const ids = users.map((user) => user.id);

  const [{ data: friends, error: friendsError }, { data: requests, error: requestsError }] =
    await Promise.all([
      supabase
        .from("friends")
        .select("friend_id")
        .eq("user_id", userId)
        .in("friend_id", ids),

      supabase
        .from("friend_requests")
        .select("receiver_id")
        .eq("sender_id", userId)
        .eq("status", "pending")
        .in("receiver_id", ids)
    ]);

  if (friendsError) throw friendsError;
  if (requestsError) throw requestsError;

  const friendIds = new Set((friends || []).map((item) => item.friend_id));
  const pendingIds = new Set((requests || []).map((item) => item.receiver_id));

  return users.map((user) => ({
    ...user,
    isFriend: friendIds.has(user.id),
    requestSent: pendingIds.has(user.id)
  }));
}

export async function sendFriendRequest(senderId, receiverId) {
  if (!senderId || !receiverId || senderId === receiverId) {
    throw new Error("Invalid friend request.");
  }

  const { data: existingFriend, error: friendError } = await supabase
    .from("friends")
    .select("friend_id")
    .eq("user_id", senderId)
    .eq("friend_id", receiverId)
    .maybeSingle();

  if (friendError) throw friendError;
  if (existingFriend) throw new Error("You are already friends.");

  const { data: existingRequest, error: requestError } = await supabase
    .from("friend_requests")
    .select("id")
    .eq("sender_id", senderId)
    .eq("receiver_id", receiverId)
    .eq("status", "pending")
    .maybeSingle();

  if (requestError) throw requestError;
  if (existingRequest) throw new Error("Friend request already sent.");

  const { error } = await supabase.from("friend_requests").insert({
    sender_id: senderId,
    receiver_id: receiverId,
    status: "pending",
    created_at: new Date().toISOString()
  });

  if (error) throw error;
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

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", senderIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map(
    (profiles || []).map((profile) => [profile.id, profile])
  );

  return requests.map((request) => ({
    ...request,
    profile: profileMap.get(request.sender_id) || null
  }));
}

export async function respondToFriendRequest(requestId, senderId, receiverId, accept) {
  const { data: request, error: requestError } = await supabase
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status")
    .eq("id", requestId)
    .eq("sender_id", senderId)
    .eq("receiver_id", receiverId)
    .eq("status", "pending")
    .maybeSingle();

  if (requestError) throw requestError;
  if (!request) throw new Error("This request is no longer available.");

  const { error: updateError } = await supabase
    .from("friend_requests")
    .update({
      status: accept ? "accepted" : "rejected",
      updated_at: new Date().toISOString()
    })
    .eq("id", requestId);

  if (updateError) throw updateError;

  if (!accept) return;

  const createdAt = new Date().toISOString();

  const { error: firstError } = await supabase.from("friends").insert({
    user_id: receiverId,
    friend_id: senderId,
    created_at: createdAt
  });

  if (firstError) throw firstError;

  const { error: secondError } = await supabase.from("friends").insert({
    user_id: senderId,
    friend_id: receiverId,
    created_at: createdAt
  });

  if (secondError) {
    console.error(
      "The reverse friendship record could not be created:",
      secondError
    );
    throw new Error(
      "The request was accepted, but the second friendship record failed. Please contact support."
    );
  }
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url, status, last_seen, bio")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
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
  const text = content.trim();

  if (!text) throw new Error("Message cannot be empty.");

  const messageData = {
    sender_id: userId,
    receiver_id: friendId,
    content: text,
    chat_id: friendId,
    created_at: new Date().toISOString(),
    read: false,
    message_type: "text"
  };

  const { data, error } = await supabase
    .from("direct_messages")
    .insert(messageData)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function markConversationRead(friendId) {
  const { error } = await supabase.rpc("mark_messages_as_read", {
    p_sender_id: friendId
  });

  if (error) {
    console.warn("Could not mark messages as read:", error.message);
  }
}

export function subscribeToConversation(userId, friendId, onInsert, onUpdate, onDelete) {
  const ids = [userId, friendId].sort();
  const channel = supabase
    .channel(`chat:${ids[0]}:${ids[1]}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "direct_messages" },
      (payload) => {
        const message = payload.new;

        const belongsToConversation =
          (message.sender_id === userId && message.receiver_id === friendId) ||
          (message.sender_id === friendId && message.receiver_id === userId);

        if (belongsToConversation) onInsert?.(message);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "direct_messages" },
      (payload) => {
        const message = payload.new;

        const belongsToConversation =
          (message.sender_id === userId && message.receiver_id === friendId) ||
          (message.sender_id === friendId && message.receiver_id === userId);

        if (belongsToConversation) onUpdate?.(message);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "direct_messages" },
      (payload) => {
        onDelete?.(payload.old);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
