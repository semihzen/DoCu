// src/TagPickerModal.js
import React, { useEffect, useMemo, useState } from "react";
import "./popup.css";

export default function TagPickerModal({
  open,
  onClose,
  onConfirm,
  allTags = [],
  title = "Select Tags",
  initialSelectedIds = [],
}) {
  const [q, setQ] = useState("");
  const [selectedIds, setSelectedIds] = useState(
    (initialSelectedIds || []).map(String)
  );
  const [newName, setNewName] = useState("");
  const [pendingNames, setPendingNames] = useState([]);

  useEffect(() => {
  if (!open) return;
  setQ("");
  setSelectedIds((initialSelectedIds || []).map(String));
  setNewName("");
  setPendingNames([]);
  // başka dependency yok
}, [open]); 

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return qq ? allTags.filter(t => (t.name || "").toLowerCase().includes(qq)) : allTags;
  }, [q, allTags]);

  const toggle = (id) => {
    const s = String(id);
    setSelectedIds(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const addNew = () => {
    const name = newName.trim();
    if (!name) return;
    const exists = allTags.find(t => (t.name || "").toLowerCase() === name.toLowerCase());
    if (exists) {
      const idStr = String(exists.id);
      if (!selectedIds.includes(idStr)) setSelectedIds([...selectedIds, idStr]);
    } else if (!pendingNames.some(n => n.toLowerCase() === name.toLowerCase())) {
      setPendingNames([...pendingNames, name]);
    }
    setNewName("");
  };

  const canConfirm = selectedIds.length > 0 || pendingNames.length > 0;

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}  // 👈 focus için güvenlik
        style={{ pointerEvents: "auto" }}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <input
            type="text"
            className="form-input"
            placeholder="Search tag"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            style={{ marginBottom: 8, pointerEvents: "auto" }}
          />

          <div className="tag-list-box">
            {filtered.length === 0 && <div className="muted">No tags</div>}
            {filtered.map((t) => {
              const idStr = String(t.id);
              const checked = selectedIds.includes(idStr);
              return (
                <label
                  key={t.id}
                  className={`tag-chip ${checked ? "active" : ""}`}
                  style={{ margin: 4, display: "inline-flex", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(idStr)}
                    style={{ display: "none" }}
                  />
                  {t.name}
                </label>
              );
            })}
          </div>

          {pendingNames.length > 0 && (
            <div className="pending-tags">
              {pendingNames.map((n) => (
                <span key={n} className="tag-badge dashed">
                  {n}
                  <a href="#!" onClick={(e) => { e.preventDefault(); setPendingNames(p => p.filter(x => x !== n)); }}>×</a>
                </span>
              ))}
            </div>
          )}

          <div className="row">
            <input
              type="text"
              className="form-input"
              placeholder="Create new tag"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNew()}
              style={{ pointerEvents: "auto" }}
            />
            <button className="secondary" onClick={addNew}>ADD</button>
          </div>

          <div className="actions">
            <button className="secondary" onClick={onClose}>CANCEL</button>
            <button className="primary" disabled={!canConfirm}
              onClick={() => onConfirm({ ids: selectedIds, names: pendingNames })}>
              CONFIRM
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
