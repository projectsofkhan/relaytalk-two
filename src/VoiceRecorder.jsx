import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  Trash2,
  Send,
  LoaderCircle,
  Play,
} from "lucide-react";

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];

  for (const type of types) {
    if (window.MediaRecorder?.isTypeSupported(type)) {
      return type;
    }
  }

  return "";
}

export default function VoiceRecorder({ onSend, disabled = false }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const audioUrlRef = useRef(null);

  const [state, setState] = useState("idle");
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);

      streamRef.current?.getTracks().forEach((track) => track.stop());

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  function releaseMicrophone() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    clearInterval(timerRef.current);
  }

  async function startRecording() {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Voice recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = getSupportedMimeType();

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        releaseMicrophone();

        const recordedBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        if (!recordedBlob.size) {
          setState("idle");
          setError("No audio was captured. Please try again.");
          return;
        }

        setBlob(recordedBlob);

        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }

        audioUrlRef.current = URL.createObjectURL(recordedBlob);
        setState("preview");
      };

      recorder.start(100);
      startedAtRef.current = Date.now();

      setDuration(0);
      setState("recording");

      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setDuration(elapsed);

        if (elapsed >= 5 * 60 * 1000) {
          stopRecording();
        }
      }, 200);
    } catch (recordError) {
      releaseMicrophone();

      if (
        recordError.name === "NotAllowedError" ||
        recordError.name === "PermissionDeniedError"
      ) {
        setError("Microphone permission was denied.");
      } else if (recordError.name === "NotFoundError") {
        setError("No microphone was found.");
      } else {
        setError(recordError.message || "Could not start recording.");
      }
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  function discardRecording() {
    if (recorderRef.current?.state !== "inactive") {
      recorderRef.current?.stop();
    }

    releaseMicrophone();

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    setBlob(null);
    setDuration(0);
    setState("idle");
    setError("");
  }

  async function sendRecording() {
    if (!blob || sending) return;

    setSending(true);
    setError("");

    try {
      await onSend(blob, duration);
      discardRecording();
    } catch (sendError) {
      setError(sendError.message || "Could not send voice message.");
    } finally {
      setSending(false);
    }
  }

  if (state === "idle") {
    return (
      <div className="voice-recorder">
        <button
          type="button"
          className="voice-icon-button"
          onClick={startRecording}
          disabled={disabled}
          aria-label="Record voice message"
          title="Record voice message"
        >
          <Mic size={19} />
        </button>

        {error && <span className="voice-error">{error}</span>}
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div className="voice-recorder voice-recording">
        <span className="recording-indicator" />
        <strong>{formatTime(duration)}</strong>

        <button
          type="button"
          className="voice-icon-button stop-recording"
          onClick={stopRecording}
          aria-label="Stop recording"
        >
          <Square size={17} />
        </button>

        <button
          type="button"
          className="voice-icon-button discard-recording"
          onClick={discardRecording}
          aria-label="Cancel recording"
        >
          <Trash2 size={17} />
        </button>
      </div>
    );
  }

  return (
    <div className="voice-recorder voice-preview">
      <audio controls src={audioUrlRef.current}>
        Your browser does not support audio playback.
      </audio>

      <span>{formatTime(duration)}</span>

      <button
        type="button"
        className="voice-icon-button send-recording"
        onClick={sendRecording}
        disabled={sending}
        aria-label="Send voice message"
      >
        {sending ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Send size={18} />
        )}
      </button>

      <button
        type="button"
        className="voice-icon-button discard-recording"
        onClick={discardRecording}
        disabled={sending}
        aria-label="Discard voice message"
      >
        <Trash2 size={17} />
      </button>

      {error && <span className="voice-error">{error}</span>}
    </div>
  );
}
