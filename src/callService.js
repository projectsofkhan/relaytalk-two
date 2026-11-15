
import { supabase } from "./supabase";

// Existing Jitsi as a Service configuration from the original RelayTalk app.
export const JAAS_APP_ID =
  "vpaas-magic-cookie-16664d50d3a04e79a2876de86dcc38e4";

export const JAAS_DOMAIN = "8x8.vc";

/**
 * Create a unique JaaS room.
 * The room name includes the existing application ID, as required by JaaS.
 */
function createCallRoom() {
  const uniqueRoomName = `CallApp-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)}`;

  const fullRoomName = `${JAAS_APP_ID}/${uniqueRoomName}`;

  return {
    name: fullRoomName,
    url: `https://${JAAS_DOMAIN}/${fullRoomName}`,
    id: uniqueRoomName,
  };
}

/**
 * Start an outgoing call.
 * Uses the same calls-table fields as the original RelayTalk application.
 */
export async function createOutgoingCall(callerId, receiverId) {
  if (!callerId || !receiverId) {
    throw new Error("Both caller and receiver are required.");
  }

  if (callerId === receiverId) {
    throw new Error("You cannot call your own account.");
  }

  const room = createCallRoom();

  const { data, error } = await supabase
    .from("calls")
    .insert({
      caller_id: callerId,
      receiver_id: receiverId,
      callee_id: receiverId,
      room_name: room.name,
      room_url: room.url,
      status: "ringing",
      seen: false,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    console.error("Create outgoing call failed:", error);
    throw new Error(error.message || "Could not start the call.");
  }

  return data;
}

/**
 * Retrieve one call using its existing database ID.
 */
export async function getCall(callId) {
  if (!callId) {
    throw new Error("Call ID is missing.");
  }

  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .single();

  if (error) {
    console.error("Get call failed:", error);
    throw new Error(error.message || "Could not find this call.");
  }

  return data;
}

/**
 * Update an existing call.
 * The caller supplies the status and timestamp fields.
 */
export async function updateCall(callId, updates) {
  if (!callId) {
    throw new Error("Call ID is missing.");
  }

  if (!updates || typeof updates !== "object") {
    throw new Error("Call update information is missing.");
  }

  const { data, error } = await supabase
    .from("calls")
    .update(updates)
    .eq("id", callId)
    .select("*")
    .single();

  if (error) {
    console.error("Update call failed:", error);
    throw new Error(error.message || "Could not update the call.");
  }

  return data;
}

/**
 * Listen for changes to one specific call.
 */
export function subscribeToCall(callId, callback) {
  if (!callId || typeof callback !== "function") {
    throw new Error("A call ID and callback are required.");
  }

  const channel = supabase
    .channel(`call-${callId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "calls",
        filter: `id=eq.${callId}`,
      },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Call realtime subscription failed.");
      }

      if (status === "TIMED_OUT") {
        console.error("Call realtime subscription timed out.");
      }
    });

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Listen for incoming calls addressed to the current user.
 */
export function subscribeToIncomingCalls(userId, callback) {
  if (!userId || typeof callback !== "function") {
    throw new Error("A user ID and callback are required.");
  }

  const channel = supabase
    .channel(`incoming-calls-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "calls",
        filter: `receiver_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Incoming call subscription failed.");
      }

      if (status === "TIMED_OUT") {
        console.error("Incoming call subscription timed out.");
      }
    });

  return () => {
    channel.unsubscribe();
  };
}
