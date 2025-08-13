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
  MoreVertical,
  Loader2,
  ArrowUpRight,
  RefreshCcw,
  Trash2,
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
  const [documents, setDocuments] = useState([]); // ileride bağlarız
  const [folders, setFolders] = useState([]);     // ileride bağlarız

  const [serverStats, setServerStats] = useState(null); // /AdminPanel/stats
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        // Yetki problemlerinde tüm ekran patlamasın diye allSettled
        const [statsRes, usersRes] = await Promise.allSettled([
          apiGet("/AdminPanel/stats"),
          apiGet("/Users"), // backend tarafında [Authorize(Roles="Admin")] + admin filtreli
        ]);

        if (statsRes.status === "fulfilled" && !ignore) {
          setServerStats(statsRes.value ?? null);
        } else if (statsRes.status === "rejected" && !ignore) {
          setError((e) => e || `Stats yüklenemedi: ${statsRes.reason?.message || ""}`);
        }

        if (usersRes.status === "fulfilled" && !ignore) {
          // Güvenlik için frontend tarafında da admin’i gizle (backend zaten gizliyor)
          const cleaned =
            (usersRes.value ?? []).filter((u) => {
              const email = String(u.email || "").toLowerCase();
              const role  = String(u.role  || "").toLowerCase();
              const name  = String(u.name  || "").toLowerCase();
              return !(email === "admin@admin.com" || role.includes("admin") || name === "admin");
            }) || [];
          setUsers(cleaned);
        } else if (usersRes.status === "rejected" && !ignore) {
          const msg = usersRes.reason?.message || "";
          // 401/403 ise kullanıcıya yetki mesajı göster
          setError((e) => e || (msg.includes("403") ? "Kullanıcı listesi için yetkiniz yok." : `Kullanıcılar yüklenemedi: ${msg}`));
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => (ignore = true);
  }, [refreshKey]);

  // Kartlardaki sayılar (tamamı backend'ten)
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

  // Users sekmesi için arama/filtre
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.name, u.email, u.role]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
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

  function reload() {
    setRefreshKey((k) => k + 1);
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
          <button className="refresh" onClick={reload} title="Yenile">
            <RefreshCcw size={16} />
          </button>
        </div>
      </aside>

      <main className="admin-content">
        <header className="topbar">
          <div className="search">
            <Search size={18} />
            <input
              placeholder="Ara: kullanıcı, belge, klasör, tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
            <div className="grid">
              <StatCard icon={<UsersIcon />} label="Toplam Kullanıcı " value={uiStats.totalUsersExAdmin} />
              <StatCard icon={<ShieldCheck />} label="Superuser" value={uiStats.superUsers} />
              <StatCard icon={<FileText />} label="Doküman (Toplam)" value={uiStats.totalDocs} />
              <StatCard icon={<FolderOpen />} label="Klasör" value={uiStats.totalFolders} />
              <StatCard icon={<FileText />} label="Arşivli Doküman" value={uiStats.backupArchived} />
            </div>

            <div className="panels">
              <Panel title="Son Kullanıcılar" action={<LiteLink onClick={() => setTab(Tabs.USERS)} />}>
                <UsersTable
                  rows={users.slice(0, 5)}
                  onPromote={promoteToSuperuser}
                  onDemote={demoteToUser}
                  onDelete={deleteUser}
                  compact
                />
              </Panel>
              <Panel title="Arşivli Dokümanlar" action={null}>
                <div className="muted">Doküman listesi endpoint’i eklenince bağlayacağız.</div>
              </Panel>
              <Panel title="Klasörler" action={null}>
                <div className="muted">Klasör listesi endpoint’i eklenince bağlayacağız.</div>
              </Panel>
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
            />
          </section>
        )}

        {tab === Tabs.DOCUMENTS && (
          <section>
            <h2 className="heading">
              <FileText size={18} /> Dokümanlar
            </h2>
            <div className="muted">Doküman listesi endpoint’i eklenince bağlayacağız.</div>
          </section>
        )}

        {tab === Tabs.FOLDERS && (
          <section>
            <h2 className="heading">
              <FolderOpen size={18} /> Klasörler
            </h2>
            <div className="muted">Klasör listesi endpoint’i eklenince bağlayacağız.</div>
          </section>
        )}
      </main>
    </div>
  );
}

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

function Panel({ title, action, children }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        <div className="panel-actions">{action}</div>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

function LiteLink({ onClick }) {
  return (
    <button className="lite-link" onClick={onClick}>
      Tümünü Gör <MoreVertical size={16} />
    </button>
  );
}

function UsersTable({ rows, onPromote, onDemote, onDelete, compact }) {
  return (
    <div className={`table-wrap ${compact ? "compact" : ""}`}>
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

function DocumentsTable({ rows, compact }) {
  return (
    <div className={`table-wrap ${compact ? "compact" : ""}`}>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Başlık</th>
            <th>Oluşturan</th>
            <th>Etiketler</th>
            <th>Arşiv</th>
            <th>Oluşturulma</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 && (
            <tr>
              <td colSpan={6} className="muted">Veri yok</td>
            </tr>
          )}
          {(rows || []).map((d, idx) => (
            <tr key={d.id ?? idx}>
              <td>{idx + 1}</td>
              <td className="cell-title">
                <FileText size={16} /> {d.title || "-"}
              </td>
              <td>{d.createdByName || d.createdBy || "-"}</td>
              <td>
                <div className="tags">
                  {(d.tags || []).map((t, i) => (
                    <span key={i} className="tag">
                      <TagIcon size={12} /> {t.name || t}
                    </span>
                  ))}
                </div>
              </td>
              <td>{d.archived ? <span className="badge success">Evet</span> : <span className="badge muted">Hayır</span>}</td>
              <td>{formatDate(d.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FoldersTable({ rows, compact }) {
  return (
    <div className={`table-wrap ${compact ? "compact" : ""}`}>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Ad</th>
            <th>Oluşturan</th>
            <th>Oluşturulma</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 && (
            <tr>
              <td colSpan={4} className="muted">Veri yok</td>
            </tr>
          )}
          {(rows || []).map((f, idx) => (
            <tr key={f.id ?? idx}>
              <td>{idx + 1}</td>
              <td className="cell-title">
                <FolderOpen size={16} /> {f.name || "-"}
              </td>
              <td>{f.createdByName || f.createdBy || "-"}</td>
              <td>{formatDate(f.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(d) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    return dt.toLocaleString();
  } catch {
    return String(d);
  }
}
