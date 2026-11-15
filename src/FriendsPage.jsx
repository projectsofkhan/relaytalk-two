
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getFriends,
  getIncomingRequests,
  searchUsers,
  sendFriendRequest,
  respondToFriendRequest
} from "./data";

function Avatar({ user, large = false }) {
  const name = user?.username || user?.full_name || "?";

  return (
    <div className={`user-avatar ${large ? "user-avatar-large" : ""}`}>
      {user?.avatar_url ? (
        <img src={user.avatar_url} alt={name} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

export default function FriendsPage({ session }) {
  const userId = session.user.id;

  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [results, setResults] = useState([]);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(async () => {
    setError("");

    try {
      const [friendList, incoming] = await Promise.all([
        getFriends(userId),
        getIncomingRequests(userId)
      ]);

      setFriends(friendList);
      setRequests(incoming);
    } catch (err) {
      setError(err.message || "Could not load your friends.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const value = term.trim();

    if (value.length < 2) {
      setResults([]);
      return;
    }

    let active = true;
    const timeout = setTimeout(async () => {
      setSearching(true);

      try {
        const users = await searchUsers(userId, value);
        if (active) setResults(users);
      } catch (err) {
        if (active) setError(err.message || "Search failed.");
      } finally {
        if (active) setSearching(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [term, userId]);

  async function handleAdd(user) {
    setBusyId(user.id);
    setError("");

    try {
      await sendFriendRequest(userId, user.id);

      setResults((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, requestSent: true } : item
        )
      );
    } catch (err) {
      setError(err.message || "Could not send friend request.");
    } finally {
      setBusyId("");
    }
  }

  async function handleRequest(request, accept) {
    setBusyId(request.id);
    setError("");

    try {
      await respondToFriendRequest(
        request.id,
        request.sender_id,
        userId,
        accept
      );

      setRequests((current) =>
        current.filter((item) => item.id !== request.id)
      );

      if (accept) {
        await refresh();
      }
    } catch (err) {
      setError(err.message || "Could not update friend request.");
      await refresh();
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="workspace-page">
      <div className="page-heading">
        <div>
          <span className="page-kicker">YOUR PEOPLE</span>
          <h1>Friends</h1>
          <p>Find people and manage your connections.</p>
        </div>
        <span className="count-pill">{friends.length} friends</span>
      </div>

      {error && <div className="workspace-error">{error}</div>}

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <h2>Find people</h2>
            <p>Search RelayTalk by username.</p>
          </div>
        </div>

        <input
          className="workspace-search"
          type="search"
          placeholder="Search usernames..."
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />

        {searching && <p className="subtle-message">Searching...</p>}

        {term.trim().length >= 2 && !searching && (
          <div className="user-list">
            {results.length === 0 ? (
              <p className="subtle-message">No matching users found.</p>
            ) : (
              results.map((user) => (
                <div className="user-row" key={user.id}>
                  <Avatar user={user} />
                  <div className="user-row-info">
                    <strong>{user.full_name || user.username}</strong>
                    <span>@{user.username}</span>
                  </div>

                  {user.isFriend ? (
                    <span className="muted-action">Friends</span>
                  ) : user.requestSent ? (
                    <span className="muted-action">Request sent</span>
                  ) : (
                    <button
                      className="small-primary"
                      disabled={busyId === user.id}
                      onClick={() => handleAdd(user)}
                    >
                      {busyId === user.id ? "Sending..." : "Add"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <h2>Friend requests</h2>
            <p>People who want to connect with you.</p>
          </div>
          <span className="count-pill">{requests.length}</span>
        </div>

        {loading ? (
          <p className="subtle-message">Loading requests...</p>
        ) : requests.length === 0 ? (
          <div className="empty-panel">
            <span>✦</span>
            <strong>All caught up</strong>
            <p>You don't have any pending friend requests.</p>
          </div>
        ) : (
          <div className="user-list">
            {requests.map((request) => (
              <div className="user-row" key={request.id}>
                <Avatar user={request.profile} />
                <div className="user-row-info">
                  <strong>
                    {request.profile?.full_name ||
                      request.profile?.username ||
                      "RelayTalk user"}
                  </strong>
                  <span>@{request.profile?.username || "unknown"}</span>
                </div>
                <div className="request-actions">
                  <button
                    className="small-primary"
                    disabled={busyId === request.id}
                    onClick={() => handleRequest(request, true)}
                  >
                    Accept
                  </button>
                  <button
                    className="small-secondary"
                    disabled={busyId === request.id}
                    onClick={() => handleRequest(request, false)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <h2>Your friends</h2>
            <p>Start a conversation with someone you know.</p>
          </div>
        </div>

        {loading ? (
          <p className="subtle-message">Loading friends...</p>
        ) : friends.length === 0 ? (
          <div className="empty-panel">
            <span>♡</span>
            <strong>Your list starts here</strong>
            <p>Search for someone above and send a friend request.</p>
          </div>
        ) : (
          <div className="user-list">
            {friends.map((friend) => (
              <div className="user-row" key={friend.id}>
                <Avatar user={friend} />
                <div className="user-row-info">
                  <strong>{friend.full_name || friend.username}</strong>
                  <span>@{friend.username}</span>
                </div>
                <div className="friend-actions">
                  <Link
                    className="small-secondary link-action"
                    to={`/app/profile/${friend.id}`}
                  >
                    Profile
                  </Link>
                  <Link
                    className="small-primary link-action"
                    to={`/app/chat/${friend.id}`}
                  >
                    Message
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
