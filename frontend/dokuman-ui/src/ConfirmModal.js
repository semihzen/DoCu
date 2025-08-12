import React from "react";
import "./popup.css"; // mevcut stil dosyanı kullanıyoruz

export default function ConfirmModal({ open, title="Onay", message, confirmText="Sil", cancelText="İptal", danger=true, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p style={{whiteSpace:"pre-wrap", margin:0}}>{message}</p>
        </div>
        <div className="modal-footer" style={{display:"flex", justifyContent:"flex-end", gap:8}}>
          <button className="secondary" onClick={onCancel}>{cancelText}</button>
          <button className={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
