import React, { useState, useMemo, useEffect } from "react";
import "./popup.css";

const API_BASE = import.meta?.env?.VITE_API_BASE_URL || "http://localhost:5244";

export default function EditDocumentModal({ open, doc, allTags = [], onClose, onSaved }) {
  // title/version
  const [title, setTitle] = useState(doc?.title || doc?.name || "");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // tags
  const [tagNames, setTagNames] = useState([]);   // seçili etiket isimleri
  const [search, setSearch] = useState("");

  const token = localStorage.getItem("token");
  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const norm = (s) => (s ?? "").toString().trim();

  const hasTag = (name) => tagNames.some(t => t.toLowerCase() === name.toLowerCase());
  const toggleTag = (name) => {
    const n = norm(name);
    if (!n) return;
    setTagNames(prev =>
      prev.some(t => t.toLowerCase() === n.toLowerCase())
        ? prev.filter(t => t.toLowerCase() !== n.toLowerCase())
        : [...prev, n]
    );
  };

  // modal reset + mevcut doc tagleri yükle
  useEffect(() => {
    if (!open || !doc) return;
    setTitle(doc?.title || doc?.name || "");
    setFile(null);
    setMsg("");
    setBusy(false);
    setSearch("");

    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/Documents/${doc.id}/tags`, { headers: { ...authHeader } });
        if (r.ok) {
          const items = await r.json(); // [{id,name}]
          setTagNames((items || []).map(x => x.name).filter(Boolean));
        } else {
          setTagNames([]);
        }
      } catch { setTagNames([]); }
    })();
  }, [doc, open]); // eslint-disable-line

  // title kaydet
  const saveName = async () => {
    const newTitle = norm(title);
    if (!newTitle) return setMsg("Başlık boş olamaz.");
    if ((doc?.title || doc?.name || "") === newTitle) return setMsg("Değişiklik yok.");

    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/Documents/${doc.id}`, {
        method: "PUT",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle })
      });
      if (res.ok) { setMsg("Başlık güncellendi."); onSaved?.(); }
      else { const txt = await res.text().catch(() => ""); setMsg(`Güncelleme başarısız (HTTP ${res.status}) ${txt}`); }
    } catch (e) { setMsg(e.message || "Güncelleme başarısız."); }
    finally { setBusy(false); }
  };

  // yeni sürüm
  const uploadNewVersion = async () => {
    if (!file) return setMsg("Yüklenecek dosyayı seçin.");
    setBusy(true); setMsg("");
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch(`${API_BASE}/api/Documents/${doc.id}/versions`, { method: "POST", headers: { ...authHeader }, body: form });
      if (res.ok) { setMsg("Yeni sürüm yüklendi."); setFile(null); onSaved?.(); }
      else { const txt = await res.text().catch(() => ""); setMsg(`Sürüm yükleme başarısız (HTTP ${res.status}) ${txt}`); }
    } catch (e) { setMsg(e.message || "Sürüm yükleme başarısız."); }
    finally { setBusy(false); }
  };

  // etiketleri kaydet
  const saveTags = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`${API_BASE}/api/Documents/${doc.id}/tags`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(tagNames)   // ["tag1","tag2"]
      });
      if (res.ok) { setMsg("Etiketler güncellendi."); onSaved?.(); }
      else { const txt = await res.text().catch(() => ""); setMsg(`Etiket kaydetme başarısız (HTTP ${res.status}) ${txt}`); }
    } catch (e) { setMsg(e.message || "Etiket kaydetme başarısız."); }
    finally { setBusy(false); }
  };

  // öneriler (yazarken filtre)
  const suggestions = useMemo(() => {
    const q = norm(search).toLowerCase();
    if (!q) return [];
    const have = new Set(tagNames.map(t => t.toLowerCase()));
    return (allTags || [])
      .map(t => t?.name || t)
      .filter(Boolean)
      .filter(n => n.toLowerCase().includes(q) && !have.has(n.toLowerCase()))
      .slice(0, 6);
  }, [search, allTags, tagNames]);

  // ESC ile kapat
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
          <h3>Dokümanı Düzenle</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Başlık */}
          <label className="form-label">Başlık (Ad)</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Yeni başlık" />
          <button className="primary" onClick={saveName} disabled={busy}>Kaydet</button>

          <hr className="modal-sep" />

          {/* Etiketler */}
          <label className="form-label">Etiketler</label>
          <input
            className="form-input"
            placeholder="Etiket ara / yeni ekle"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); toggleTag(search); setSearch(''); } }}
          />
          {suggestions.length > 0 && (
            <div className="suggest-list">
              {suggestions.map((s) => (
                <button key={s} type="button" className="suggest-item" onClick={() => { toggleTag(s); setSearch(""); }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Seçili etiketler */}
          <div className="chip-row" style={{ marginTop: 8 }}>
            {tagNames.map((t) => (
              <span key={t} className="chip">
                {t}
                <button className="chip-x" onClick={() => toggleTag(t)}>×</button>
              </span>
            ))}
          </div>

          {/* TÜM MEVCUT ETİKETLER – tıklayınca toggle */}
          <div style={{ marginTop: 12 }}>
            <div className="form-label" style={{ marginBottom: 6 }}>Mevcut Etiketler</div>
            <div className="tag-cloud">
              {(allTags || []).map((t) => {
                const name = t?.name || t;
                const selected = hasTag(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className={`tag-pill ${selected ? "selected" : ""}`}
                    onClick={() => toggleTag(name)}
                    title={selected ? "Kaldır" : "Ekle"}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="secondary" onClick={() => { toggleTag(search); setSearch(""); }} disabled={!norm(search)}>Ekle</button>
            <button className="primary" onClick={saveTags} disabled={busy}>Etiketleri Kaydet</button>
          </div>

          <hr className="modal-sep" />

          {/* Yeni sürüm */}
          <label className="form-label">Yeni Sürüm Yükle</label>
          <label htmlFor="edit-file" className="custom-file-upload" style={{ marginBottom: 8 }}>
            {file ? file.name : "Dosya seç"}
          </label>
          <input id="edit-file" type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="secondary" onClick={uploadNewVersion} disabled={busy}>Sürüm Yükle</button>

          {msg && <p className="modal-msg">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
