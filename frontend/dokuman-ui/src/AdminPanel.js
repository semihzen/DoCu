// AdminPanel.js
import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users as UsersIcon,
  FileText,
  FolderOpen,
  Tag as TagIcon,
  Search,
  ShieldCheck,
  Loader2,
  ArrowUpRight,
  RefreshCcw,
  Trash2,
  Download,
  Home,
  LogOut,
} from "lucide-react";
import "./AdminPanel.css";

/** ==== BASE URL (Docu.js ile uyumlu) ==== */
const RAW_ROOT =
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_BASE ||
  process.env.REACT_APP_API_BASE ||
  "http://localhost:5244";
const ROOT = String(RAW_ROOT).replace(/\/+$/, "");
const API_BASE = /\/api(\/|$)/i.test(ROOT) ? ROOT : `${ROOT}/api`;

function withAuthHeaders() {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// 🔐 JWT yardımcıları
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}
function useAuthRole() {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  return useMemo(() => {
    const p = token ? parseJwt(token) : null;
    const role =
      p?.role ||
      p?.roles?.[0] ||
      p?.["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
      "user";
    return String(role || "user").toLowerCase();
  }, [token]);
}

async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { headers: withAuthHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} @ ${url}${body ? ` | ${body}` : ""}`);
  }
  return res.json();
}
async function apiPatch(path, body) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: withAuthHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} @ ${url}${body ? ` | ${body}` : ""}`);
  }
  return res.json().catch(() => ({}));
}
async function apiDelete(path) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method: "DELETE", headers: withAuthHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} @ ${url}${body ? ` | ${body}` : ""}`);
  }
  return true;
}

const Tabs = { DASHBOARD: "dashboard", USERS: "users", DOCUMENTS: "documents", FOLDERS: "folders" };

export default function AdminDashboard() {
  const [tab, setTab] = useState(Tabs.DASHBOARD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [users, setUsers] = useState([]);
  const [serverStats, setServerStats] = useState(null);
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [statsRes, usersRes] = await Promise.allSettled([
          apiGet("/AdminPanel/stats"),
          apiGet("/Users"),
        ]);

        if (statsRes.status === "fulfilled" && !ignore) {
          setServerStats(statsRes.value ?? null);
        } else if (statsRes.status === "rejected" && !ignore) {
          setError((e) => e || `Stats yüklenemedi: ${statsRes.reason?.message || ""}`);
        }

        if (usersRes.status === "fulfilled" && !ignore) {
          const cleaned =
            (usersRes.value ?? []).filter((u) => {
              const email = String(u.email || "").toLowerCase();
              const role = String(u.role || "").toLowerCase();
              const name = String(u.name || "").toLowerCase();
              return !(email === "admin@admin.com" || role.includes("admin") || name === "admin");
            }) || [];
          setUsers(cleaned);
        } else if (usersRes.status === "rejected" && !ignore) {
          const msg = usersRes.reason?.message || "";
          setError((e) => e || (msg.includes("403") ? "Kullanıcı listesi için yetkiniz yok." : `Kullanıcılar yüklenemedi: ${msg}`));
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => (ignore = true);
  }, [refreshKey]);

  const uiStats = useMemo(() => {
    const s = serverStats || {};
    return {
      totalUsersExAdmin: s.UsersExAdmin ?? s.usersExAdmin ?? 0,
      superUsers: s.SuperUsers ?? s.superUsers ?? 0,
      totalDocs: s.TotalDocs ?? s.totalDocs ?? 0,
      totalFolders: s.TotalFolders ?? s.totalFolders ?? 0,
      backupArchived: s.BackupArchived ?? s.backupArchived ?? 0,
    };
  }, [serverStats]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.name, u.email, u.role].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [users, search]);

  async function promoteToSuperuser(userId) {
    try {
      setLoading(true);
      setError("");
      await apiPatch(`/Users/${userId}/role`, { role: "superuser" });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: "superuser" } : u)));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(`Rol güncellenemedi: ${err.message || ""}`);
    } finally {
      setLoading(false);
    }
  }
  async function demoteToUser(userId) {
    try {
      setLoading(true);
      setError("");
      await apiPatch(`/Users/${userId}/role`, { role: "user" });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: "user" } : u)));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(`Rol geri alınamadı: ${err.message || ""}`);
    } finally {
      setLoading(false);
    }
  }
  async function deleteUser(userId) {
    const u = users.find((x) => x.id === userId);
    const label = u ? `${u.name || ""} <${u.email || ""}>` : `#${userId}`;
    if (!window.confirm(`Bu kullanıcı silinsin mi?\n${label}`)) return;

    try {
      setLoading(true);
      setError("");
      await apiDelete(`/Users/${userId}`);
      setUsers((prev) => prev.filter((x) => x.id !== userId));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(`Silme başarısız: ${err.message || ""}`);
    } finally {
      setLoading(false);
    }
  }
  function reload() { setRefreshKey((k) => k + 1); }

  function logout() {
    try {
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
    } finally {
      window.location.href = "/login"; // projende route farklıysa değiştir
    }
  }

  return (
    <div className="admin-scope admin-root">
      <aside className="sidebar">
        <div className="brand">
          <LayoutDashboard size={22} />
          <span>DoCu Admin</span>
        </div>
        <nav>
          <button className={`nav-btn ${tab === Tabs.DASHBOARD ? "active" : ""}`} onClick={() => setTab(Tabs.DASHBOARD)}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button className={`nav-btn ${tab === Tabs.USERS ? "active" : ""}`} onClick={() => setTab(Tabs.USERS)}>
            <UsersIcon size={18} /> Users
          </button>
          <button className={`nav-btn ${tab === Tabs.DOCUMENTS ? "active" : ""}`} onClick={() => setTab(Tabs.DOCUMENTS)}>
            <FileText size={18} /> Archived Docs
          </button>
          <button className={`nav-btn ${tab === Tabs.FOLDERS ? "active" : ""}`} onClick={() => setTab(Tabs.FOLDERS)}>
            <FolderOpen size={18} /> Folders
          </button>
        </nav>
        <div className="sidebar-footer">
          <button
            className="refresh"
            onClick={() => (window.location.href = "/")}
            title="Ana Sayfa"
            style={{ marginRight: 8 }}
          >
            <Home size={16} />
          </button>
          <button
            className="refresh"
            onClick={logout}
            title="Logout"
            style={{ marginRight: 8 }}
          >
            <LogOut size={16} />
          </button>
          <button className="refresh" onClick={reload} title="Yenile">
            <RefreshCcw size={16} />
          </button>
        </div>
      </aside>

      <main className="admin-content">
        <header className="topbar">
          {/* dashboard’dayken arama yok */}
          {tab !== Tabs.DASHBOARD && (
            <div className="search">
              <Search size={18} />
              <input
                placeholder="Ara: kullanıcı, belge, klasör, tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <div className="right">
            {loading && (
              <div className="loading">
                <Loader2 className="spin" size={18} /> Yükleniyor
              </div>
            )}
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {tab === Tabs.DASHBOARD && (
          <section>
            {/* sadece istatistik kartları */}
            <div className="grid">
              <StatCard icon={<UsersIcon />} label="Toplam Kullanıcı " value={uiStats.totalUsersExAdmin} />
              <StatCard icon={<ShieldCheck />} label="Superuser" value={uiStats.superUsers} />
              <StatCard icon={<FileText />} label="Doküman (Toplam)" value={uiStats.totalDocs} />
              <StatCard icon={<FolderOpen />} label="Klasör" value={uiStats.totalFolders} />
              <StatCard icon={<FileText />} label="Arşivli Doküman" value={uiStats.backupArchived} />
            </div>
          </section>
        )}

        {tab === Tabs.USERS && (
          <section>
            <h2 className="heading">
              <UsersIcon size={18} /> Kullanıcılar
            </h2>
            <UsersTable
              rows={filteredUsers}
              onPromote={promoteToSuperuser}
              onDemote={demoteToUser}
              onDelete={deleteUser}
              scrollHeight="60vh"
            />
          </section>
        )}

        {tab === Tabs.DOCUMENTS && (
          <section>
            <h2 className="heading">
              <FileText size={18} /> Archived Docs
            </h2>
            <ArchivedExplorer query={search} />
          </section>
        )}

        {tab === Tabs.FOLDERS && (
          <section>
            <h2 className="heading">
              <FolderOpen size={18} /> Klasörler
            </h2>
            <DocExplorer key={refreshKey} query={search} />
          </section>
        )}
      </main>
    </div>
  );
}

/* ---------------- Small components ---------------- */

function StatCard({ icon, label, value }) {
  return (
    <div className="stat-card">
      <div className="meta">
        <div className="icon-wrap">{icon}</div>
        <span className="label">{label}</span>
      </div>
      <div className="value">
        {value}
        <ArrowUpRight size={16} />
      </div>
    </div>
  );
}

function UsersTable({ rows, onPromote, onDemote, onDelete, compact, scrollHeight }) {
  return (
    <div
      className={`table-wrap ${compact ? "compact" : ""}`}
      style={scrollHeight ? { maxHeight: scrollHeight, overflowY: "auto" } : undefined}
    >
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Ad Soyad</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Oluşturulma</th>
            <th>Aksiyon</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 && (
            <tr>
              <td colSpan={6} className="muted">Veri yok</td>
            </tr>
          )}
          {(rows || []).map((u, idx) => {
            const role = String(u.role || "").toLowerCase();
            const isSuper = role.includes("super");
            const isAdmin = role.includes("admin");
            const isUser  = role === "user";
            return (
              <tr key={u.id ?? idx}>
                <td>{idx + 1}</td>
                <td>{u.name || "-"}</td>
                <td>{u.email || "-"}</td>
                <td>
                  <span className={`badge ${isSuper ? "success" : isAdmin ? "warning" : "muted"}`}>
                    {u.role || "user"}
                  </span>
                </td>
                <td>{formatDate(u.createdAt)}</td>
                <td>
                  <div className="btn-row">
                    <button
                      className="btn primary"
                      disabled={isSuper || isAdmin}
                      onClick={() => onPromote && onPromote(u.id)}
                      title={isAdmin ? "Admin rolü değiştirilemez" : "Superuser yap"}
                    >
                      <ShieldCheck size={16} /> Superuser
                    </button>
                    <button
                      className="btn"
                      disabled={isUser || isAdmin}
                      onClick={() => onDemote && onDemote(u.id)}
                      title={isAdmin ? "Admin rolü değiştirilemez" : "User yap"}
                      style={{ marginLeft: 8 }}
                    >
                      User yap
                    </button>
                    <button
                      className="btn danger"
                      disabled={isAdmin}
                      onClick={() => onDelete && onDelete(u.id)}
                      title={isAdmin ? "Admin kullanıcı silinemez" : "Sil"}
                      style={{ marginLeft: 8 }}
                    >
                      <Trash2 size={16} /> Sil
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function formatDate(d) {
  if (!d) return "-";
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

/* =========================================================
   DoCuments gezgini (Folders sekmesi)
   ========================================================= */
function DocExplorer({ query = "" }) {
  const role = useAuthRole();
  const isAdmin = role === "admin";
  const isSuperuser = role === "superuser";
  const scope = (isAdmin || isSuperuser) ? "all" : "mine";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState(null);
  const [path, setPath] = useState([{ id: null, name: "(Root)" }]);
  const [folders, setFolders] = useState([]);
  const [docs, setDocs] = useState([]);

  async function load(fId) {
    setLoading(true);
    setError("");
    try {
      const fUrl = fId ? `/Folders?parentId=${fId}` : `/Folders`;
      const allFolders = await apiGet(fUrl);
      const subs = fId ? (allFolders || []) : (allFolders || []).filter((x) => !x.parentId);
      setFolders(subs || []);

      const dUrl = `/Documents?scope=${scope}${fId ? `&folderId=${fId}` : ""}`;
      const ds = await apiGet(dUrl);
      setDocs(Array.isArray(ds) ? ds : []);
      setFolderId(fId ?? null);
    } catch (e) {
      setError(e.message || "Klasör içeriği yüklenemedi.");
      setFolders([]); setDocs([]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(null); }, [scope]);

  function openFolder(f) {
    setPath((p) => [...p, { id: f.id, name: f.name }]);
    load(f.id);
  }
  function goCrumb(i) {
    const target = path[i];
    setPath((p) => p.slice(0, i + 1));
    load(target.id);
  }

  const q = (query || "").trim().toLowerCase();
  const filteredFolders = useMemo(() => {
    if (!q) return folders;
    return (folders || []).filter(f =>
      String(f.name || "").toLowerCase().includes(q) ||
      String(f.path || "").toLowerCase().includes(q) ||
      String(f.ownerEmail || f.ownerName || f.ownerId || "").toLowerCase().includes(q)
    );
  }, [folders, q]);

  const filteredDocs = useMemo(() => {
    if (!q) return docs;
    return (docs || []).filter(d => {
      const hay = [
        d.title, d.name, d.fileName,
        d.ownerEmail, d.ownerName, d.ownerId
      ].filter(Boolean).map(x => String(x).toLowerCase()).join(" ");
      const tagText = Array.isArray(d.tags) ? d.tags.map(t => (t.name || t)).join(" ").toLowerCase() : "";
      return hay.includes(q) || tagText.includes(q);
    });
  }, [docs, q]);

  async function downloadDoc(id, fallbackName) {
    try {
      const res = await fetch(`${API_BASE}/Documents/${id}/download`, { headers: withAuthHeaders() });
      if (!res.ok) throw new Error("İndirme başarısız");
      let fileName = fallbackName || "document";
      const dispo = res.headers.get("Content-Disposition") || res.headers.get("content-disposition");
      if (dispo) {
        const m = dispo.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
        if (m && m[1]) fileName = decodeURIComponent(m[1].replace(/"/g, ""));
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert(e.message || "İndirme başarısız"); }
  }

  return (
    <div className="panel">
      <div className="panel-head"><h3>DoCuments</h3></div>
      <div className="panel-body">
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          {path.map((p, i) => (
            <span key={p.id ?? "root"}>
              <a href="#!" onClick={(e) => { e.preventDefault(); goCrumb(i); }}>{p.name}</a>
              {i < path.length - 1 ? " / " : ""}
            </span>
          ))}
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}

        {loading ? (
          <div className="muted">Yükleniyor…</div>
        ) : (
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {(filteredFolders || []).map((f) => (
              <div key={`f-${f.id}`} className="doc-row" style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                <FolderOpen className="file-icon" />
                <div style={{ flex: 1, marginLeft: 10, cursor: "pointer" }} onClick={() => openFolder(f)}>
                  <div style={{ fontWeight: 600 }}>{f.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Owner: {f.ownerEmail || f.ownerName || f.ownerId || "-"} • Updated: {f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "-"}
                  </div>
                </div>
              </div>
            ))}

            {(filteredDocs || []).length === 0 && (filteredFolders || []).length === 0 && (
              <div className="muted">Eşleşen öğe bulunamadı.</div>
            )}

            {(filteredDocs || []).map((d) => (
              <div key={`d-${d.id}`} className="doc-row" style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                <FileText className="file-icon" />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div style={{ fontWeight: 600 }}>{d.title || d.name}</div>
                  {Array.isArray(d.tags) && d.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      {d.tags.map((t) => (
                        <span key={t.id || t} className="tag" style={{ border: "1px solid #ddd", padding: "2px 6px", borderRadius: 10, fontSize: 12 }}>
                          <TagIcon size={12} /> {t.name || t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Owner: {d.ownerEmail || d.ownerName || d.ownerId || "-"} • Updated: {d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "-"}
                  </div>
                </div>
                <button className="btn" onClick={() => downloadDoc(d.id, d.fileName || `${d.title || "document"}.bin`)}>
                  <Download size={16} /> Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Archived Docs gezgini (Documents_backup_Once)
   ========================================================= */
function ArchivedExplorer({ query = "" }) {
  const role = useAuthRole(); // admin/superuser
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allFolders, setAllFolders] = useState([]);     // tüm klasörler
  const [archived, setArchived] = useState([]);         // arşivli dokümanlar
  const [folderId, setFolderId] = useState(null);       // aktif klasör
  const [path, setPath] = useState([{ id: null, name: "(Root)" }]);

  const folderMap = useMemo(() => {
    const m = new Map();
    (allFolders || []).forEach(f => m.set(String(f.id), f));
    return m;
  }, [allFolders]);

  const hasUnknown = useMemo(() => {
    return (archived || []).some(a => a.folderId && !folderMap.has(String(a.folderId)));
  }, [archived, folderMap]);

  const childFolders = useMemo(() => {
    if (folderId === "__unknown__") return [];
    const list = (allFolders || []).filter(
      f => String(f.parentId ?? "") === String(folderId ?? "")
    );
    return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [allFolders, folderId]);

  const visibleDocs = useMemo(() => {
    if (folderId === "__unknown__") {
      return (archived || []).filter(a => a.folderId && !folderMap.has(String(a.folderId)));
    }
    return (archived || []).filter(
      a => String(a.folderId ?? "") === String(folderId ?? "")
    );
  }, [archived, folderId, folderMap]);

  // 🔎 Global arama (query doluysa klasör ağacını bypass eder)
  const q = (query || "").trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return null;
    return (archived || []).filter(d => {
      const hay = [
        d.title, d.fileName,
        d.ownerEmail, d.ownerName, d.ownerId,
        d.mimeType
      ].filter(Boolean).map(x => String(x).toLowerCase()).join(" ");
      return hay.includes(q);
    });
  }, [archived, q]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [folders, backups] = await Promise.all([
          apiGet("/Folders"),
          apiGet("/AdminPanel/archived-docs"),
        ]);
        if (ignore) return;
        setAllFolders(Array.isArray(folders) ? folders : []);
        setArchived(Array.isArray(backups) ? backups : []);
      } catch (e) {
        if (!ignore) setError(e.message || "Arşivli dokümanlar yüklenemedi.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [role]);

  function openFolder(f) {
    setPath(p => [...p, { id: f.id, name: f.name }]);
    setFolderId(f.id);
  }
  function openUnknown() {
    setPath(p => [...p, { id: "__unknown__", name: "(Unknown / Deleted)" }]);
    setFolderId("__unknown__");
  }
  function goCrumb(i) {
    const target = path[i];
    setPath(p => p.slice(0, i + 1));
    setFolderId(target.id);
  }

  async function downloadArchived(id, fallbackName) {
    try {
      const res = await fetch(`${API_BASE}/AdminPanel/archived-docs/${id}/download`, {
        headers: withAuthHeaders(),
      });
      if (!res.ok) throw new Error("İndirme başarısız");
      let fileName = fallbackName || "document";
      const dispo = res.headers.get("Content-Disposition") || res.headers.get("content-disposition");
      if (dispo) {
        const m = dispo.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
        if (m && m[1]) fileName = decodeURIComponent(m[1].replace(/"/g, ""));
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "İndirme başarısız");
    }
  }

  // ---------------- RENDER ----------------
  return (
    <div className="panel">
      <div className="panel-head"><h3>Archived DoCuments</h3></div>
      <div className="panel-body">
        {/* Breadcrumb (sadece arama boşsa) */}
        {!q && (
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            {path.map((p, i) => (
              <span key={p.id ?? "root"}>
                <a href="#!" onClick={(e) => { e.preventDefault(); goCrumb(i); }}>{p.name}</a>
                {i < path.length - 1 ? " / " : ""}
              </span>
            ))}
          </div>
        )}

        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}

        {loading ? (
          <div className="muted">Yükleniyor…</div>
        ) : (
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {/* 🔎 Arama modu: sadece sonuç listesi */}
            {q ? (
              <>
                {(searchResults || []).length === 0 && (
                  <div className="muted">Eşleşen arşiv bulunamadı.</div>
                )}
                {(searchResults || []).map((d) => (
                  <div
                    key={`as-${d.id}`}
                    className="doc-row"
                    style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}
                  >
                    <FileText className="file-icon" />
                    <div style={{ flex: 1, marginLeft: 10 }}>
                      <div style={{ fontWeight: 600 }}>{d.title || d.fileName || "(untitled)"}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        Owner: {d.ownerEmail || d.ownerName || d.ownerId || "-"} •{" "}
                        Version: {d.versionNumber ?? "-"} •{" "}
                        Size: {d.fileSizeBytes ?? 0} bytes •{" "}
                        Updated: {d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "-"}
                      </div>
                    </div>
                    <button className="btn" onClick={() => downloadArchived(d.id, d.fileName || `${d.title || "document"}.bin`)}>
                      <Download size={16} /> Download
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <>
                {/* Klasör ağacı modu */}
                {(childFolders || []).map((f) => (
                  <div
                    key={`af-${f.id}`}
                    className="doc-row"
                    style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}
                  >
                    <FolderOpen className="file-icon" />
                    <div style={{ flex: 1, marginLeft: 10, cursor: "pointer" }} onClick={() => openFolder(f)}>
                      <div style={{ fontWeight: 600 }}>{f.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Path: {f.path || "-"} • Updated: {f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "-"}
                      </div>
                    </div>
                  </div>
                ))}

                {folderId === null && hasUnknown ? (
                  <div
                    key="af-unknown"
                    className="doc-row"
                    style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}
                  >
                    <FolderOpen className="file-icon" />
                    <div style={{ flex: 1, marginLeft: 10, cursor: "pointer" }} onClick={openUnknown}>
                      <div style={{ fontWeight: 600 }}>(Unknown / Deleted)</div>
                      <div className="muted" style={{ fontSize: 12 }}>Silinmiş/ulaşılamayan klasöre ait arşivler</div>
                    </div>
                  </div>
                ) : null}

                {(visibleDocs || []).length === 0 && (childFolders || []).length === 0 ? (
                  <div className="muted">Bu klasörde arşiv yok.</div>
                ) : null}

                {(visibleDocs || []).map((d) => (
                  <div
                    key={`ad-${d.id}`}
                    className="doc-row"
                    style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}
                  >
                    <FileText className="file-icon" />
                    <div style={{ flex: 1, marginLeft: 10 }}>
                      <div style={{ fontWeight: 600 }}>{d.title || d.fileName || "(untitled)"}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        Owner: {d.ownerEmail || d.ownerName || d.ownerId || "-"} •{" "}
                        Version: {d.versionNumber ?? "-"} •{" "}
                        Size: {d.fileSizeBytes ?? 0} bytes •{" "}
                        Updated: {d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "-"}
                      </div>
                    </div>
                    <button className="btn" onClick={() => downloadArchived(d.id, d.fileName || `${d.title || "document"}.bin`)}>
                      <Download size={16} /> Download
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
