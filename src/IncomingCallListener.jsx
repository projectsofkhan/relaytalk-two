
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Phone, PhoneOff } from "lucide-react";
import { getProfile } from "./data";
import {
  subscribeToIncomingCalls,
  updateCall,
} from "./callService";

export default function IncomingCallListener({ session }) {
  const navigate = useNavigate();
  const location = useLocation();

  const userId = session?.user?.id;

  const [incoming, setIncoming] = useState(null);
  const [caller, setCaller] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    const unsubscribe = subscribeToIncomingCalls(userId, async (payload) => {
      const call = payload.new;

      if (
        !call ||
        call.receiver_id !== userId ||
        call.status !== "ringing"
      ) {
        return;
      }

      if (location.pathname.startsWith("/app/call/")) return;

      setIncoming(call);
      setCaller(null);

      try {
        const profile = await getProfile(call.caller_id);
        if (active) setCaller(profile);
      } catch (error) {
        console.warn("Could not load caller profile:", error);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId, location.pathname]);

  async function acceptCall() {
    if (!incoming || working) return;

    setWorking(true);

    try {
      await updateCall(incoming.id, {
        status: "active",
        answered_at: new Date().toISOString(),
        seen: true,
      });

      const callId = incoming.id;
      setIncoming(null);

      navigate(`/app/call/${callId}?incoming=1`);
    } catch (error) {
      console.error("Could not accept call:", error);
      alert(error.message || "Could not accept this call.");
    } finally {
      setWorking(false);
    }
  }

  async function declineCall() {
    if (!incoming || working) return;

    setWorking(true);

    try {
      await updateCall(incoming.id, {
        status: "rejected",
        ended_at: new Date().toISOString(),
        seen: true,
      });

      setIncoming(null);
    } catch (error) {
      console.error("Could not decline call:", error);
      alert(error.message || "Could not decline this call.");
    } finally {
      setWorking(false);
    }
  }

  if (!incoming) return null;

  return (
    <div className="incoming-call-backdrop">
      <section className="incoming-call-card">
        <div className="incoming-call-avatar">
          {caller?.avatar_url ? (
            <img src={caller.avatar_url} alt="" />
          ) : (
            caller?.username?.[0]?.toUpperCase() || "?"
          )}
        </div>

        <span className="incoming-call-label">Incoming call</span>

        <h2>{caller?.username || "RelayTalk user"}</h2>

        <p>Someone is calling you on RelayTalk.</p>

        <div className="incoming-call-actions">
          <button
            type="button"
            className="incoming-decline"
            onClick={declineCall}
            disabled={working}
            aria-label="Decline call"
          >
            <PhoneOff size={21} />
          </button>

          <button
            type="button"
            className="incoming-accept"
            onClick={acceptCall}
            disabled={working}
            aria-label="Accept call"
          >
            <Phone size={21} />
          </button>
        </div>

        {working && <small>Connecting...</small>}
      </section>
    </div>
  );
}
