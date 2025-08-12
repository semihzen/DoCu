// src/components/FolderEditModal.js
import React, { useEffect, useMemo, useState } from "react";
import "./FolderEdit.css";

export default function FolderEditModal({
  open,
  folder,
  allTags = [],
  initialTagNames = [],
  onClose,
  onSave
}) {
  const [name, setName] = useState(folder?.name || "");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set(initialTagNames.map(s => s.toLowerCase())));

  useEffect(() => { setName(folder?.name || ""); }, [folder?.id]);
  useEffect(() => { setSelected(new Set(initialTagNames.map(s => s.toLowerCase()))); }, [initialTagNames.join("|")]);

  const toggle = (tagName) => {
    const key = String(tagName || "").toLowerCase();
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelected(next);
  };

  const addNewTag = () => {
    const t = search.trim();
    if (!t) return;
    const next = new Set(selected);
    next.add(t.toLowerCase());
    setSelected(next);
    setSearch("");
  };

  const tagList = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = allTags.map(t => t.name);
    const sorted = [...new Set(base)].sort((a, b) => {
      const sa = selected.has(String(a).toLowerCase()) ? -1 : 1;
      const sb = selected.has(String(b).toLowerCase()) ? -1 : 1;
      return sa - sb || String(a).localeCompare(String(b));
    });
    return q ? sorted.filter(n => n.toLowerCase().includes(q)) : sorted;
  }, [allTags, search, selected]);

  if (!open) return null;

  return (
    <div className="fe-backdrop" onClick={onClose}>
      <div className="fe-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fe-header">
          <h3>Klasörü Düzenle</h3>
          <button className="fe-close" onClick={onClose}>×</button>
        </div>

        <div className="fe-body">
          <div>
            <label className="fe-label">Klasör Adı</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Yeni klasör adı"
              className="fe-input"
            />
          </div>

          <div>
            <label className="fe-label">Etiketler</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Etiket ara / yeni ekle"
              className="fe-input"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewTag(); }}}
            />
            <button onClick={addNewTag} className="fe-addBtn">Ekle</button>

            <div className="fe-tagList">
              {tagList.map((n) => {
                const sel = selected.has(n.toLowerCase());
                return (
                  <button
                    key={n}
                    onClick={() => toggle(n)}
                    className={`fe-tagChip ${sel ? "selected" : ""}`}
                    title={sel ? "Kaldır" : "Ekle"}
                  >
                    {n}
                  </button>
                );
              })}
              {tagList.length === 0 && (
                <div className="fe-empty">Sonuç yok. Enter’a basarak “{search.trim()}” ekleyebilirsin.</div>
              )}
            </div>
          </div>
        </div>

        <div className="fe-footer">
          <button onClick={onClose} className="fe-cancel">İptal</button>
          <button
            onClick={async () => {
              const tagNames = Array.from(selected);
              await onSave?.(name.trim(), tagNames);
            }}
            className="fe-save"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
