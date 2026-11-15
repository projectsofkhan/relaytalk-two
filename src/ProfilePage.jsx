import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, UserPlus } from "lucide-react";
import {
  areFriends,
  getProfile,
  sendFriendRequest,
} from "./data";

export default function ProfilePage({ session }) {
  const { userId } = useParams();
  const currentUserId = session?.user?.id;
  const viewingSelf = userId === currentUserId;

  const [profile, setProfile] = useState(null);
  const [isFriend, setIsFriend] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const result = await getProfile(userId);

        if (!result) {
          throw new Error("This profile could not be found.");
        }

        let friendship = false;

        if (!viewingSelf) {
          friendship = await areFriends(currentUserId, userId);
        }

        if (!active) return;

        setProfile(result);
        setIsFriend(friendship);
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [userId, currentUserId, viewingSelf]);

  async function handleAddFriend() {
    setWorking(true);
    setError("");

    try {
      await sendFriendRequest(currentUserId, userId);
      setRequestSent(true);
    } catch (requestError) {
      setError(requestError.message || "Could not send friend request.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <div className="page-loading">Loading profile...</div>;
  }

  if (error && !profile) {
    return (
      <section className="page-error">
        <p>{error}</p>
        <Link to="/app/friends">Back to friends</Link>
      </section>
    );
  }

  return (
    <section className="profile-page">
      <header className="page-heading">
        <Link
          to="/app/friends"
          className="icon-button"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1>Profile</h1>
      </header>

      <div className="profile-card">
        <div className="profile-avatar">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : (
            profile?.username?.[0]?.toUpperCase() || "?"
          )}
        </div>

        <h2>{profile?.username || "User"}</h2>
        <p className="profile-handle">@{profile?.username || "user"}</p>

        <p className="profile-bio">
          {profile?.bio || "No introduction added yet."}
        </p>

        {!viewingSelf && (
          <div className="profile-actions">
            {isFriend ? (
              <Link
                className="primary-button"
                to={`/app/chat/${userId}`}
              >
                <MessageCircle size={17} />
                Message
              </Link>
            ) : requestSent ? (
              <button className="secondary-button" disabled>
                Request sent
              </button>
            ) : (
              <button
                className="primary-button"
                onClick={handleAddFriend}
                disabled={working}
              >
                <UserPlus size={17} />
                {working ? "Sending..." : "Add friend"}
              </button>
            )}
          </div>
        )}

        {error && <p className="inline-error">{error}</p>}
      </div>
    </section>
  );
}
