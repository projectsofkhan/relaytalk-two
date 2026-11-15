
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, PhoneOff, Video, Mic } from "lucide-react";

import { getProfile } from "./data";
import {
  JAAS_APP_ID,
  JAAS_DOMAIN,
  createOutgoingCall,
  getCall,
  updateCall,
  subscribeToCall,
} from "./callService";

import "./call.css";

export default function CallPage({ session }) {
  const { targetId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const incoming = searchParams.get("incoming") === "1";
  const mode = searchParams.get("mode") === "video" ? "video" : "audio";

  const currentUserId = session?.user?.id;

  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const callRef = useRef(null);
  const joinedRef = useRef(false);
  const endingRef = useRef(false);

  const [call, setCall] = useState(null);
  const [person, setPerson] = useState(null);
  const [status, setStatus] = useState(
    incoming ? "Opening incoming call..." : "Starting call..."
  );
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(mode === "video");

  useEffect(() => {
    let active = true;
    let unsubscribe = null;

    async function initialise() {
      try {
        if (!currentUserId || !targetId) {
          throw new Error("The call could not be opened.");
        }

        let callRecord;
        let otherUserId;

        if (incoming) {
          callRecord = await getCall(targetId);

          if (callRecord.receiver_id !== currentUserId) {
            throw new Error("This call does not belong to your account.");
          }

          if (callRecord.status !== "active") {
            throw new Error("This call is no longer active.");
          }

          otherUserId = callRecord.caller_id;
        } else {
          otherUserId = targetId;

          const profile = await getProfile(otherUserId);
          if (!profile) throw new Error("User not found.");

          callRecord = await createOutgoingCall(
            currentUserId,
            otherUserId
          );
        }

        if (!active) return;

        callRef.current = callRecord;
        setCall(callRecord);
        setPerson(await getProfile(otherUserId));

        unsubscribe = subscribeToCall(callRecord.id, (payload) => {
          const updated = payload.new;

          if (!active || !updated) return;

          setCall(updated);

          if (updated.status === "active") {
            setStatus("Connecting...");
          } else if (
            ["rejected", "cancelled", "ended"].includes(updated.status)
          ) {
            setStatus(
              updated.status === "rejected"
                ? "Call was declined."
                : updated.status === "cancelled"
                  ? "Call was cancelled."
                  : "Call ended."
            );

            leaveAndReturn(false);
          }
        });

        if (!incoming) {
          setStatus("Calling... Waiting for an answer.");
        } else {
          setStatus("Connecting...");
        }

        if (callRecord.status === "active") {
          await joinJitsi(callRecord);
        }
      } catch (initialiseError) {
        if (active) {
          setError(initialiseError.message || "Could not start call.");
          setStatus("Call unavailable");
        }
      }
    }

    initialise();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();

      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (disposeError) {
          console.warn("Jitsi cleanup:", disposeError);
        }
        apiRef.current = null;
      }
    };
  }, [currentUserId, targetId, incoming]);

  async function joinJitsi(callRecord) {
    if (joinedRef.current || !containerRef.current) return;

    joinedRef.current = true;

    try {
      if (!window.JitsiMeetExternalAPI) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector(
            'script[data-relay-jitsi="true"]'
          );

          if (existing) {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            if (window.JitsiMeetExternalAPI) resolve();
            return;
          }

          const script = document.createElement("script");
          script.src = `https://${JAAS_DOMAIN}/external_api.js`;
          script.async = true;
          script.dataset.relayJitsi = "true";
          script.onload = resolve;
          script.onerror = () =>
            reject(new Error("Could not load the calling service."));
          document.head.appendChild(script);
        });
      }

      if (!window.JitsiMeetExternalAPI) {
        throw new Error("Calling service did not load.");
      }

      const roomName =
        callRecord.room_name ||
        callRecord.room_url?.split("/").slice(-2).join("/");

      if (!roomName) throw new Error("Call room is missing.");

      const api = new window.JitsiMeetExternalAPI(JAAS_DOMAIN, {
        roomName,
        parentNode: containerRef.current,
        width: "100%",
        height: "100%",
        userInfo: {
          displayName:
            session?.user?.user_metadata?.username ||
            session?.user?.email?.split("@")[0] ||
            "RelayTalk user",
        },
        configOverwrite: {
          prejoinPageEnabled: false,
          enableWelcomePage: false,
          startWithAudioMuted: false,
          startWithVideoMuted: !videoEnabled,
          disableChat: true,
          disableInviteFunctions: true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
        },
      });

      apiRef.current = api;

      api.addEventListener("videoConferenceJoined", () => {
        setConnected(true);
        setStatus("Connected");
      });

      api.addEventListener("readyToClose", () => {
        leaveAndReturn(true);
      });
    } catch (joinError) {
      joinedRef.current = false;
      setError(joinError.message || "Could not join call.");
      setStatus("Unable to connect");
    }
  }

  async function leaveAndReturn(updateDatabase = true) {
    if (endingRef.current) return;
    endingRef.current = true;

    const currentCall = callRef.current;

    if (updateDatabase && currentCall?.id) {
      try {
        await updateCall(currentCall.id, {
          status: "ended",
          ended_at: new Date().toISOString(),
        });
      } catch (endError) {
        console.warn("Could not update call status:", endError);
      }
    }

    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch {}
      apiRef.current = null;
    }

    navigate(
      incoming
        ? "/app/friends"
        : `/app/chat/${targetId}`,
      { replace: true }
    );
  }

  function toggleMute() {
    if (!apiRef.current) return;
    apiRef.current.executeCommand("toggleAudio");
    setMuted((value) => !value);
  }

  function toggleVideo() {
    if (!apiRef.current) return;
    apiRef.current.executeCommand("toggleVideo");
    setVideoEnabled((value) => !value);
  }

  return (
    <section className="call-page">
      <header className="call-page-header">
        <button
          type="button"
          className="call-back-button"
          onClick={() => leaveAndReturn(true)}
          aria-label="Leave call"
        >
          <ArrowLeft size={20} />
        </button>

        <div>
          <strong>{person?.username || "RelayTalk call"}</strong>
          <span>{status}</span>
        </div>
      </header>

      {error && <div className="call-error">{error}</div>}

      <div className="jitsi-container" ref={containerRef}>
        {!connected && (
          <div className="call-waiting">
            <div className="call-waiting-avatar">
              {person?.avatar_url ? (
                <img src={person.avatar_url} alt="" />
              ) : (
                person?.username?.[0]?.toUpperCase() || "R"
              )}
            </div>
            <h2>{person?.username || "RelayTalk user"}</h2>
            <p>{status}</p>
          </div>
        )}
      </div>

      <footer className="call-controls">
        <button
          type="button"
          onClick={toggleMute}
          disabled={!connected}
          className={muted ? "call-control active" : "call-control"}
          aria-label="Toggle microphone"
        >
          <Mic size={20} />
        </button>

        <button
          type="button"
          onClick={toggleVideo}
          disabled={!connected}
          className={
            videoEnabled ? "call-control" : "call-control active"
          }
          aria-label="Toggle camera"
        >
          <Video size={20} />
        </button>

        <button
          type="button"
          onClick={() => leaveAndReturn(true)}
          className="call-control call-hangup"
          aria-label="End call"
        >
          <PhoneOff size={21} />
        </button>
      </footer>
    </section>
  );
}
