import React, { useEffect, useMemo, useState } from "react";
import { Search, FolderOpen, FileText, Download, Edit, ChevronDown, LogOut, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./Docu.css";

import EditDocumentModal from "./EditDocumentModal";
import DescriptionModal from "./description";
import TagPickerModal from "./TagPickerModal";
import FolderEditModal from "./FolderEditModal";
import ConfirmModal from "./ConfirmModal"; // ✅ eklendi

const API_BASE = import.meta?.env?.VITE_API_BASE_URL || "http://localhost:5244";

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
    return JSON.parse(jsonPayload);
  } catch { return null; }
}

const getOwnerId = (e) => e?.ownerId ?? e?.createdById ?? e?.userId ?? e?.uploaderId ?? e?.createdBy ?? e?.owner?.id ?? null;
const getOwnerLabel = (e) => e?.ownerEmail ?? e?.createdByEmail ?? e?.ownerName ?? e?.createdByName ?? e?.owner?.email ?? e?.owner?.name ?? getOwnerId(e) ?? "-";
const eqIds = (a, b) => a != null && b != null && String(a) === String(b);

const DocuWebsite = () => {
  const navigate = useNavigate();

  // left form
  const [selectedFolder, setSelectedFolder] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [allFolders, setAllFolders] = useState([]);

  // new folder
  const [newFolderName, setNewFolderName] = useState("");
  const [createUnderSelected, setCreateUnderSelected] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  // tags
  const [allTags, setAllTags] = useState([]);

  // explorer
  const [viewFolderId, setViewFolderId] = useState(null);
  const [childFolders, setChildFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [pathStack, setPathStack] = useState([{ id: null, name: "(Root)" }]);

  // ui
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // modals
  const [editDoc, setEditDoc] = useState(null);
  const [descDoc, setDescDoc] = useState(null);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagModalFor, setTagModalFor] = useState(null); // 'folder' | 'doc'
  const [tagModalTitle, setTagModalTitle] = useState("");

  // chosen tags from TagPicker
  const [chosenIds, setChosenIds] = useState([]);
  const [chosenNames, setChosenNames] = useState([]);

  // Folder edit modal
  const [editFolder, setEditFolder] = useState(null);        // { id, name }
  const [editFolderTags, setEditFolderTags] = useState([]);  // ["name1","name2"]

  // Confirm modal (delete)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState({ message: "", onOk: null });

  // auth
  const token = localStorage.getItem("token");
  const userEmail = localStorage.getItem("email") || "Kullanıcı";
  const auth = useMemo(() => {
    const p = token ? parseJwt(token) : null;
    const role = p?.role || p?.roles?.[0] || p?.["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] || "User";
    const userId = p?.sub || p?.userId || p?.["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] || null;
    return { role, userId };
  }, [token]);
  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const isAdmin = auth.role?.toLowerCase() === "admin";
  const isSuperUser = auth.role?.toLowerCase() === "superuser";

  const logoutOn401 = (res) => {
    if (res?.status === 401 || res?.status === 403) { localStorage.clear(); navigate("/Login"); return true; }
    return false;
  };
  const handleLogout = () => { localStorage.clear(); navigate("/Login"); };

  useEffect(() => {
    if (!token) { navigate("/Login"); return; }
    (async () => {
      try {
        const fRes = await fetch(`${API_BASE}/api/Folders`, { headers: { ...authHeader } });
        if (logoutOn401(fRes)) return;
        if (!fRes.ok) throw new Error(`Folders GET failed (${fRes.status})`);
        setAllFolders((await fRes.json()) || []);

        const tRes = await fetch(`${API_BASE}/api/Tags`, { headers: { ...authHeader } });
        if (!logoutOn401(tRes) && tRes.ok) setAllTags(await tRes.json());

        await loadFolderContent(null);
      } catch (e) {
        console.error(e);
        setError(`Başlangıç verileri yüklenemedi: ${e.message}`);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshTags = async () => {
    try {
      const tRes = await fetch(`${API_BASE}/api/Tags`, { headers: { ...authHeader } });
      if (!logoutOn401(tRes) && tRes.ok) setAllTags(await tRes.json());
    } catch {}
  };

  const loadFolderContent = async (folderId) => {
    try {
      setLoading(true); setError("");
      let subs = [];
      if (folderId) {
        const fr = await fetch(`${API_BASE}/api/Folders?parentId=${folderId}`, { headers: { ...authHeader } });
        if (logoutOn401(fr)) return;
        if (fr.ok) subs = await fr.json();
      } else {
        const fr = await fetch(`${API_BASE}/api/Folders`, { headers: { ...authHeader } });
        if (logoutOn401(fr)) return;
        if (fr.ok) { const all = await fr.json(); subs = (all || []).filter((x) => !x.parentId); }
      }
      setChildFolders(subs || []);

      const scope = (isAdmin || isSuperUser) ? "all" : "mine";
      const url = `${API_BASE}/api/Documents?scope=${scope}` + (folderId ? `&folderId=${folderId}` : "");
      const dr = await fetch(url, { headers: { ...authHeader } });
      if (logoutOn401(dr)) return;
      if (!dr.ok) throw new Error(`Documents GET failed (${dr.status})`);
      const docs = await dr.json();
      setDocuments(Array.isArray(docs) ? docs : []);
      setViewFolderId(folderId ?? null);
    } catch (e) {
      console.error(e);
      setChildFolders([]); setDocuments([]);
      setError("Klasör içeriği yüklenemedi.");
    } finally { setLoading(false); }
  };

  // ---------------- TagPicker açıcılar ----------------
  const openTagModalForFolder = () => {
    if (!newFolderName.trim()) { setError("Klasör adı zorunlu."); return; }
    setTagModalFor("folder");
    setTagModalTitle("Select Tags for Folder");
    setChosenIds([]); setChosenNames([]);
    setTagModalOpen(true);
  };

  const openTagModalForDoc = () => {
    if (!title.trim()) { setError("Başlık zorunlu."); return; }
    if (!file) { setError("Lütfen bir dosya seçiniz."); return; }
    setTagModalFor("doc");
    setTagModalTitle("Select Tags for Document");
    setChosenIds([]); setChosenNames([]);
    setTagModalOpen(true);
  };

  const onTagModalConfirm = async ({ ids, names }) => {
    setTagModalOpen(false);
    if ((ids?.length || 0) === 0 && (names?.length || 0) === 0) {
      setError("En az bir etiket seçin veya oluşturun."); return;
    }
    try {
      if (tagModalFor === "folder") {
        setCreatingFolder(true);

        const idNames = (ids || [])
          .map(String)
          .map(id => (allTags || []).find(t => String(t.id) === id)?.name)
          .filter(Boolean);

        const finalNames = [...new Set([...(names || []), ...idNames])];

        const body = {
          name: newFolderName.trim(),
          parentId: (createUnderSelected && selectedFolder) ? selectedFolder : null,
          tags: finalNames
        };

        const res = await fetch(`${API_BASE}/api/Folders`, {
          method: "POST",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (logoutOn401(res)) return;
        if (!res.ok) throw new Error(await res.text());

        setOk("Klasör oluşturuldu.");
        setNewFolderName("");

        await refreshTags();
        const fRes = await fetch(`${API_BASE}/api/Folders`, { headers: { ...authHeader } });
        if (!logoutOn401(fRes) && fRes.ok) setAllFolders(await fRes.json());
        await loadFolderContent(viewFolderId);

      } else if (tagModalFor === "doc") {
        setUploading(true); setProgress(0);
        const form = new FormData();
        form.append("title", title);
        if (selectedFolder) form.append("folderId", selectedFolder);
        if (description.trim()) form.append("description", description.trim());
        form.append("file", file);
        (ids || []).forEach((id, i) => form.append(`tagIds[${i}]`, String(id)));
        (names || []).forEach((n, i) => form.append(`tags[${i}]`, n));

        const res = await fetch(`${API_BASE}/api/Documents`, { method: "POST", headers: { ...authHeader }, body: form });
        if (logoutOn401(res)) return;
        if (!res.ok) throw new Error((await res.text()) || `Upload failed: ${res.status}`);

        setOk("Doküman yüklendi.");
        setTitle(""); setDescription(""); setFile(null);
        await refreshTags();
        await loadFolderContent(viewFolderId);
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "İşlem başarısız.");
    } finally {
      setCreatingFolder(false);
      setUploading(false);
    }
  };

  // ------------------------------------------------------

  const handleDownload = async (docId, fallbackName) => {
    setError(""); setOk("");
    try {
      const res = await fetch(`${API_BASE}/api/Documents/${docId}/download`, { method: "GET", headers: { ...authHeader } });
      if (logoutOn401(res)) return;
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`İndirme başarısız (HTTP ${res.status})${txt ? `: ${txt}` : ""}`);
      }
      let fileName = fallbackName || "document";
      const dispo = res.headers.get("Content-Disposition") || res.headers.get("content-disposition");
      if (dispo) {
        const m = dispo.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
        if (m && m[1]) fileName = decodeURIComponent(m[1].replace(/"/g, ""));
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) { console.error(e); setError(e.message || "İndirme başarısız."); }
  };

  // ✅ Doküman sil: onay modalı
  const handleDelete = (doc) => {
    setConfirmCfg({
      message: `Bu doküman silinecek!\nBaşlık: ${doc.title || doc.name}\nEmin misiniz?`,
      onOk: async () => {
        try {
          const res = await fetch(`${API_BASE}/api/Documents/${doc.id}`, { method: "DELETE", headers: { ...authHeader } });
          if (logoutOn401(res)) return;
          if (!res.ok) throw new Error("Silme başarısız.");
          setOk("Doküman silindi.");
          await loadFolderContent(viewFolderId);
        } catch (e) { setError(e.message); }
      }
    });
    setConfirmOpen(true);
  };

  // ✅ Klasör sil: onay modalı
  const handleFolderDelete = (folder) => {
    setConfirmCfg({
      message: `Bu klasör ve içindeki tüm dosyalar silinecek!\nKlasör: ${folder.name}\nEmin misiniz?`,
      onOk: async () => {
        try {
          const res = await fetch(`${API_BASE}/api/Folders/${folder.id}?recursive=true&cascade=true`, { method: "DELETE", headers: { ...authHeader } });
          if (logoutOn401(res)) return;
          if (!res.ok) throw new Error("Klasör silme başarısız.");
          setOk("Klasör silindi.");
          const fRes = await fetch(`${API_BASE}/api/Folders`, { headers: { ...authHeader } });
          if (!logoutOn401(fRes) && fRes.ok) setAllFolders(await fRes.json());
          await loadFolderContent(viewFolderId);
        } catch (e) { console.error(e); setError(e.message || "Klasör silinemedi."); }
      }
    });
    setConfirmOpen(true);
  };

  // *** Klasör düzenleme modalını aç ***
  const handleFolderEdit = async (folder) => {
    try {
      const tr = await fetch(`${API_BASE}/api/Folders/${folder.id}/tags`, { headers: { ...authHeader } });
      let tagNames = [];
      if (!logoutOn401(tr) && tr.ok) {
        const items = await tr.json(); // [{id,name}]
        tagNames = (items || []).map(x => x.name);
      }
      setEditFolder(folder);
      setEditFolderTags(tagNames);
    } catch (e) {
      console.error(e);
      setEditFolder(folder);
      setEditFolderTags([]);
    }
  };

  // *** Klasör düzenlemeyi kaydet ***
  const saveFolderEdit = async (newName, tagNames) => {
    if (!editFolder) return;
    try {
      const res = await fetch(`${API_BASE}/api/Folders/${editFolder.id}`, {
        method: "PUT",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ ...editFolder, name: newName })
      });
      if (logoutOn401(res)) return;
      if (!res.ok) throw new Error("Klasör adı güncellenemedi.");

      const tres = await fetch(`${API_BASE}/api/Folders/${editFolder.id}/tags?propagate=true&recursive=false`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(tagNames || [])
      });
      if (logoutOn401(tres)) return;
      if (!tres.ok) throw new Error("Klasör etiketleri güncellenemedi.");

      setOk("Klasör güncellendi.");
      setEditFolder(null);
      await refreshTags();
      await loadFolderContent(viewFolderId);
    } catch (e) {
      setError(e.message || "Güncelleme başarısız.");
    }
  };

  const isOwnerForEditDelete = (doc) => (isAdmin ? true : eqIds(getOwnerId(doc), auth.userId));
  const canManageFolder = (folder) => (isAdmin ? true : eqIds(getOwnerId(folder), auth.userId));

  // --- Search helpers + filtreler ---
  const norm = (s) => (s ?? "").toString().toLowerCase().trim();
  const q = norm(searchTerm);
  const tagQuery = q.startsWith("tag:") ? q.slice(4).trim() : null;

  const tagMatches = (doc, needle) => {
    const fromObjects = Array.isArray(doc.tags) ? doc.tags.map(t => (t?.name ?? t)) : [];
    const fromTagNames = Array.isArray(doc.tagNames) ? doc.tagNames : [];
    const all = [...fromObjects, ...fromTagNames].map(norm).filter(Boolean);
    return all.some(n => n.includes(needle));
  };

  const textMatches = (doc, needle) =>
    norm(doc.title || doc.name).includes(needle) ||
    norm(doc.description).includes(needle);

  const visibleFolders = childFolders.filter((f) => norm(f.name).includes(tagQuery ?? q));
  const visibleDocs = documents.filter((d) => tagQuery ? tagMatches(d, tagQuery) : (textMatches(d, q) || tagMatches(d, q)));

  return (
    <div className="docu-container">
      {/* Navbar */}
      <div className="navbar">
        <h1 className="header-title">Welcome DoCu!</h1>
        <div className="navbar-right">
         {/* 🟦 Sadece adminler için Admin Panel linki */}
    {isAdmin && (
      <a
        href="/Admin"
        className="admin-link"
        style={{
          marginRight: 12,
          padding: "6px 10px",
          borderRadius: 6,
          background: "#3498db",
          color: "#fff",
          textDecoration: "none",
          fontSize: 14
        }}
      >
        Admin Panel
      </a>
    )}
          <span className="user-email">{userEmail}</span>
          <span className="role-badge" style={{ marginLeft: 8 }}>{auth.role}</span>
          <button className="logout-button" onClick={handleLogout}><LogOut size={18} /> Çıkış</button>
        </div>
      </div>

      <div className="main-content">
        {/* Left Panel */}
        <div className="left-panel">
          <h2 className="panel-title">Add DoCument</h2>

          {/* New Folder */}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">New Folder</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="form-input"
              />
              <button type="button" className="upload-button" onClick={openTagModalForFolder} disabled={creatingFolder}>
                {creatingFolder ? "Adding..." : "Add"}
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13 }}>
              <input type="checkbox" checked={createUnderSelected} onChange={(e) => setCreateUnderSelected(e.target.checked)} />
              <span>Create under selected folder</span>
            </label>
          </div>

          {/* Upload target folder */}
          <div className="form-group">
            <label className="form-label">Folders</label>
            <div className="select-wrapper">
              <select value={selectedFolder} onChange={(e) => setSelectedFolder(e.target.value)} className="form-select">
                <option value="">— No Folder (Root) —</option>
                {allFolders.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
              </select>
              <ChevronDown className="select-icon" />
            </div>
          </div>

          {/* Title */}
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="form-input"
              placeholder="Set Document Title"
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="form-input"
              placeholder="Write a short description"
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>

          {/* File */}
          <div className="form-group">
            <label className="form-label">Upload DoCument</label>
            <label htmlFor="file-upload" className="custom-file-upload">
              <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="Logo" style={{ width: 20, height: 20, marginRight: 8, verticalAlign: "middle" }} />
              {file ? file.name : "Choose DoCument"}
            </label>
            <input id="file-upload" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
          </div>

          {/* Upload button opens Tag modal */}
          <button onClick={openTagModalForDoc} className="upload-button" disabled={uploading}>
            {uploading ? "Uploading..." : "Upload"}
          </button>

          {uploading && (
            <div style={{ marginTop: 8 }}>
              <div className="progress-bar"><div className="progress" style={{ width: `${progress}%` }} /></div>
              <div className="progress-text">%{progress}</div>
            </div>
          )}
          {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
          {ok && <p className="ok-text" style={{ marginTop: 8 }}>{ok}</p>}
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          <div className="search-container">
            <div className="search-wrapper">
              <Search className="search-icon" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search" className="search-input" />
            </div>
          </div>

          <div className="documents-container">
            <div className="folder-header">
              <FolderOpen className="folder-icon" />
              <h3 className="folder-title">DoCuments</h3>
            </div>

            {/* Breadcrumb */}
            <div style={{ fontSize: 13, margin: "6px 0 12px 0" }}>
              {pathStack.map((p, i) => (
                <span key={p.id ?? "root"}>
                  <a href="#!" onClick={(e) => { e.preventDefault(); setPathStack((prev) => prev.slice(0, i + 1)); loadFolderContent(p.id); }}>{p.name}</a>
                  {i < pathStack.length - 1 ? " / " : ""}
                </span>
              ))}
            </div>

            <div className="documents-list">
              {loading ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <p className="loading-text">Loading…</p>
                </div>
              ) : (
                <>
                  {/* Folders */}
                  {visibleFolders.map((f) => {
                    const canDeleteFolder = isAdmin || (getOwnerId(f) && String(getOwnerId(f)) === String(auth.userId));
                    return (
                      <div key={`folder-${f.id}`} className="document-item">
                        <div className="document-info" onClick={() => { setPathStack((prev) => [...prev, { id: f.id, name: f.name }]); loadFolderContent(f.id); }} style={{ cursor: "pointer", flex: 1 }}>
                          <FolderOpen className="file-icon" />
                          <div className="document-details">
                            <h4 className="document-name">{f.name}</h4>
                            <p className="document-description">Folder</p>
                            <div className="meta-row">
                              <span className="meta">Owner: {getOwnerLabel(f)}</span>
                              <span className="meta">Updated: {f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "-"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="document-actions">
                          {canDeleteFolder && (
                            <button className="action-button delete-button" onClick={(e) => { e.stopPropagation(); handleFolderDelete(f); }}>
                              <Trash2 className="action-icon" /> Delete
                            </button>
                          )}
                          {canManageFolder(f) && (
                            <button className="action-button edit-button" onClick={(e) => { e.stopPropagation(); handleFolderEdit(f); }}>
                              <Edit className="action-icon" /> Edit
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Documents */}
                  {visibleDocs.length > 0 ? (
                    visibleDocs.map((doc) => (
                      <div key={doc.id} className="document-item">
                        <div className="document-info">
                          <FileText className="file-icon" />
                          <div className="document-details">
                            <h4 className="document-name">
                              <a href="#!" className="see-desc-link" onClick={(e) => { e.preventDefault(); setDescDoc(doc); }} aria-label="See description">See description </a>
                              {doc.title || doc.name}
                            </h4>
                            

                            {Array.isArray(doc.tags) && doc.tags.length > 0 && (
                              <div className="meta-row" style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {doc.tags.map((t) => (
                                  <span key={t.id || t} className="tag-badge" style={{ fontSize: 12, border: "1px solid #ddd", padding: "2px 6px", borderRadius: 10 }}>
                                    {t.name || t}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="meta-row">
                              <span className="meta">Owner: {getOwnerLabel(doc)}</span>
                              <span className="meta">Updated: {doc.updatedAt ? new Date(doc.updatedAt).toLocaleString() : "-"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="document-actions">
                          <button
                            className="action-button download-button"
                            onClick={() => handleDownload(doc.id, doc.fileName || `${doc.title || "document"}.bin`)}>
                            <Download className="action-icon" /> Download
                          </button>
                          {isOwnerForEditDelete(doc) && (
                            <button className="action-button edit-button" onClick={() => setEditDoc(doc)}>
                              <Edit className="action-icon" /> Edit
                            </button>
                          )}
                          {isOwnerForEditDelete(doc) && (
                            <button className="action-button delete-button" onClick={() => handleDelete(doc)}>
                              <Trash2 className="action-icon" /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    visibleFolders.length === 0 && (
                      <div className="empty-state">
                        <FileText className="empty-icon" />
                        <p className="empty-text">Bu klasörde öğe yok.</p>
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <EditDocumentModal
        open={!!editDoc}
        doc={editDoc}
        allTags={allTags}
        onClose={() => setEditDoc(null)}
        onSaved={async () => { setEditDoc(null); await loadFolderContent(viewFolderId); await refreshTags(); }}
      />

      <DescriptionModal
        open={!!descDoc}
        doc={descDoc}
        onClose={() => setDescDoc(null)}
      />

      <TagPickerModal
        open={tagModalOpen}
        title={tagModalTitle}
        allTags={allTags}
        onClose={() => setTagModalOpen(false)}
        onConfirm={onTagModalConfirm}
      />

      {/* Klasör Düzenleme Modalı */}
      <FolderEditModal
        open={!!editFolder}
        folder={editFolder}
        allTags={allTags}
        initialTagNames={editFolderTags}
        onClose={() => setEditFolder(null)}
        onSave={saveFolderEdit}
      />

      {/* ✅ Silme onayı (doküman + klasör) */}
      <ConfirmModal
        open={confirmOpen}
        message={confirmCfg.message}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          try { await confirmCfg.onOk?.(); }
          finally { setConfirmOpen(false); }
        }}
      />
    </div>
  );
};

export default DocuWebsite;
