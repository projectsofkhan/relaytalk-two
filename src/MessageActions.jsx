import { useState } from "react";
import { Edit3, Trash2, X, Check } from "lucide-react";

export default function MessageActions({
  message,
  onEdit,
  onDelete,
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(message.content || "");
  const [working, setWorking] = useState(false);

  if (message.message_type !== "text" || message.content === "__DELETED__") {
    return null;
  }

  async function saveEdit() {
    const nextValue = value.trim();

    if (!nextValue || nextValue === message.content || working) {
      setEditing(false);
      return;
    }

    setWorking(true);

    try {
      await onEdit(message.id, nextValue);
      setEditing(false);
    } finally {
      setWorking(false);
    }
  }

  async function confirmDelete() {
    if (working) return;

    const confirmed = window.confirm("Delete this message?");
    if (!confirmed) return;

    setWorking(true);

    try {
      await onDelete(message.id);
    } finally {
      setWorking(false);
    }
  }

  if (editing) {
    return (
      <div className="message-edit-panel">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={5000}
          autoFocus
        />

        <div className="message-edit-controls">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={working}
            aria-label="Cancel editing"
          >
            <X size={15} />
            Cancel
          </button>

          <button
            type="button"
            onClick={saveEdit}
            disabled={!value.trim() || working}
            aria-label="Save edited message"
          >
            <Check size={15} />
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="message-actions">
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={working}
        title="Edit message"
        aria-label="Edit message"
      >
        <Edit3 size={14} />
      </button>

      <button
        type="button"
        onClick={confirmDelete}
        disabled={working}
        title="Delete message"
        aria-label="Delete message"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
