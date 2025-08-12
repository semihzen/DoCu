import React, { useEffect } from "react";
// popup.css, EditDocumentModal ile aynı dosya -> src/pages/popup.css
import "./popup.css";

export default function DescriptionModal({ open, doc, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !doc) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Description</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: 10, fontWeight: 600 }}>
            {doc.title || doc.name || "Document"}
          </div>
          <div
            style={{
              whiteSpace: "pre-wrap",
              border: "1px solid #eee",
              borderRadius: 8,
              padding: 12,
              minHeight: 80
            }}
          >
            {doc.description?.length ? doc.description : "— No description —"}
          </div>
        </div>
      </div>
    </div>
  );
}
