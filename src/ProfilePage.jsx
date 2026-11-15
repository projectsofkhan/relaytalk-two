
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getProfile, sendFriendRequest } from "./data";
import { supabase } from "./supabase";

export default function ProfilePage({ session }) {
  const { userId } = useParams();
  const myId = session.user.id;

  const [profile, setProfile] = useState(null);
  const [isFriend, setIsFriend] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const data = await getProfile(userId);

        if (!data) throw new Error("Profile not found.");

        if (!active) return;
        setProfile(data);

        if (userId === myId) return;

        const [friendResult, requestResult] = await Promise.all([
          supabase
            .from("friends")
            .select("friend_id")
            .eq("user_id", myId)
            .eq("friend_id", userId)
            .maybeSingle(),

          supabase
            .from("friend_requests")
            .select("id")
            .eq("sender_id", myId)
            .eq("receiver_id", userId)
            .eq("status", "pending")
            .maybeSingle()
        ]);

        if (friendResult.error) throw friendResult.error;
        if (requestResult.error) throw requestResult.error;

        if (active) {
          setIsFriend(Boolean(friendResult.data));
          setRequestSent(Boolean(requestResult.data));
        }
      } catch (err) {
        if (active) setError(err.message || "Could not load profile.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [userId, myId]);

  async function handleAddFriend() {
    setBusy(true);
    setError("");

    try {
      await sendFriendRequest(myId, userId);
      setRequestSent(true);
    } catch (err) {
      setError(err.message || "Could not send friend request.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="workspace-page">
        <p className="subtle-message">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="workspace-page">
        <div className="workspace-error">
          {error || "Profile not found."}
        </div>
        <Link to="/app/friends" className="back-link">← Back to friends</Link>
      </div>
    );
  }

  const ownProfile = profile.id === myId;

  return (
    <div className="workspace-page">
      <Link to="/app/friends" className="back-link">
        ← Friends
      </Link>

      {error && <div className="workspace-error">{error}</div>}

      <section className="profile-card">
        <div className="profile-cover" />

        <div className="profile-main">
          <div className="profile-avatar">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} />
            ) : (
              (profile.username || "?").charAt(0).toUpperCase()
            )}
          </div>

          <h1>{profile.full_name || profile.username}</h1>
          <p className="profile-username">@{profile.username}</p>

          {profile.bio ? (
            <p className="profile-bio">{profile.bio}</p>
          ) : (
            <p className="profile-bio profile-muted">
              No bio has been added yet.
            </p>
          )}

          <div className="profile-status">
            <span className="status-dot" />
            {profile.status || "Status unavailable"}
          </div>

          {!ownProfile && (
            <div className="profile-actions">
              {isFriend ? (
                <Link
                  to={`/app/chat/${profile.id}`}
                  className="small-primary link-action"
                >
                  Message
                </Link>
              ) : requestSent ? (
                <span className="muted-action">Request sent</span>
              ) : (
                <button
                  className="small-primary"
                  onClick={handleAddFriend}
                  disabled={busy}
                >
                  {busy ? "Sending..." : "Add friend"}
                </button>
              )}
            </div>
          )}

          {ownProfile && (
            <span className="muted-action">This is your profile</span>
          )}
        </div>
      </section>
    </div>
  );
}
