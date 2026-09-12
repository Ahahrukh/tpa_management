"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  Check,
  CircleMinus,
  Download,
  Eye,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  X,
} from "lucide-react";
import { SERVICES, type AuthUser, type EnvironmentKey, type ServiceKey, type Tpa, type UserPermissions } from "@/lib/types";

const createEmptyServices = () => Object.fromEntries(
  SERVICES.map(({ key }) => [key, key === "blacklistedHospitals" ? null : false]),
) as Record<ServiceKey, boolean | null>;

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [tpas, setTpas] = useState<Tpa[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<EnvironmentKey>("prod");
  const [newEnvironment, setNewEnvironment] = useState<EnvironmentKey>("prod");
  const [newServices, setNewServices] = useState<Record<EnvironmentKey, Record<ServiceKey, boolean | null>>>(() => ({ uat: createEmptyServices(), prod: createEmptyServices() }));
  const [newReviews, setNewReviews] = useState<Record<EnvironmentKey, string>>({ uat: "", prod: "" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [managedUsers, setManagedUsers] = useState<AuthUser[]>([]);
  const [selectedTpa, setSelectedTpa] = useState<Tpa | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<EnvironmentKey, string>>({ uat: "", prod: "" });

  useEffect(() => {
    let active = true;
    fetch("/api/tpas", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not load TPA data.");
        return response.json();
      })
      .then((data) => {
        if (active) setTpas(data);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Something went wrong.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      fetch("/api/tpas", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => setTpas(data))
        .catch(() => undefined);
    };
    const interval = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const filteredTpas = useMemo(
    () => tpas.filter((tpa) => tpa.activeEnvironments[environment] && tpa.name.toLowerCase().includes(search.toLowerCase())),
    [environment, search, tpas],
  );
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filteredTpas.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTpas = filteredTpas.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const environmentTpas = tpas.filter((tpa) => tpa.activeEnvironments[environment]);
  const workingCount = environmentTpas.reduce(
    (total, tpa) => total + SERVICES.filter(({ key }) => tpa.environments[environment][key]).length,
    0,
  );
  const totalChecks = environmentTpas.reduce(
    (total, tpa) => total + SERVICES.filter(({ key }) => tpa.environments[environment][key] !== null).length,
    0,
  );
  const readiness = totalChecks ? Math.round((workingCount / totalChecks) * 100) : 0;

  async function addTpa(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim()) return setError("Please enter a TPA name.");

    try {
      const response = await fetch("/api/tpas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          environments: {
            uat: { ...newServices.uat, review: newReviews.uat },
            prod: { ...newServices.prod, review: newReviews.prod },
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not add TPA.");
      setTpas((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setNewServices({ uat: createEmptyServices(), prod: createEmptyServices() });
      setNewReviews({ uat: "", prod: "" });
      setShowForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add TPA.");
    }
  }

  async function toggleService(tpa: Tpa, field: ServiceKey) {
    const key = `${tpa.id}-${field}`;
    const originalValue = tpa.environments[environment][field];
    const nextValue = field === "blacklistedHospitals"
      ? originalValue === null
        ? true
        : originalValue === true
          ? false
          : null
      : !originalValue;
    setSavingKey(key);
    setError("");
    setTpas((current) => current.map((item) => item.id === tpa.id ? { ...item, environments: { ...item.environments, [environment]: { ...item.environments[environment], [field]: nextValue } } } : item));

    try {
      const response = await fetch(`/api/tpas/${tpa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: nextValue, environment }),
      });
      if (!response.ok) throw new Error("Could not save this change.");
      const updated = await response.json();
      setTpas((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setTpas((current) => current.map((item) => item.id === tpa.id ? { ...item, environments: { ...item.environments, [environment]: { ...item.environments[environment], [field]: originalValue } } } : item));
      setError(caught instanceof Error ? caught.message : "Could not save this change.");
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteTpa(tpa: Tpa) {
    if (!window.confirm(`Delete ${tpa.name}? This cannot be undone.`)) return;
    setError("");
    const response = await fetch(`/api/tpas/${tpa.id}`, { method: "DELETE" });
    if (response.ok) setTpas((current) => current.filter((item) => item.id !== tpa.id));
    else setError("Could not delete this TPA.");
  }

  function exportCsv() {
    const headers = ["TPA Name", "Environment", ...SERVICES.map(({ label }) => label), "Review"];
    const rows = tpas.flatMap((tpa) => (["uat", "prod"] as EnvironmentKey[]).map((env) => [
      tpa.name,
      env.toUpperCase(),
      ...SERVICES.map(({ key }) => (tpa.environments[env][key] === null ? "Not tracked" : tpa.environments[env][key] ? "Working" : "Not working")),
      tpa.environments[env].review,
    ]));
    const csv = [headers, ...rows].map((row) => row.map((cell) => escapeCsv(cell)).join(",")).join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tpa-status-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function openPermissions() {
    setShowPermissions(true);
    setError("");
    const response = await fetch("/api/users", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setManagedUsers(data.users);
    else setError(data.error ?? "Could not load users.");
  }

  async function updatePermission(target: AuthUser, permission: keyof UserPermissions) {
    const nextValue = !target.permissions[permission];
    setManagedUsers((current) => current.map((item) => item.id === target.id ? { ...item, permissions: { ...item.permissions, [permission]: nextValue } } : item));
    const response = await fetch(`/api/users/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { [permission]: nextValue } }),
    });
    const data = await response.json();
    if (response.ok) setManagedUsers((current) => current.map((item) => item.id === target.id ? data.user : item));
    else {
      setManagedUsers((current) => current.map((item) => item.id === target.id ? target : item));
      setError(data.error ?? "Could not update permission.");
    }
  }

  function openDetails(tpa: Tpa) {
    setSelectedTpa(tpa);
    setReviewDrafts({ uat: tpa.environments.uat.review, prod: tpa.environments.prod.review });
  }

  async function saveReview(env: EnvironmentKey) {
    if (!selectedTpa || !user.permissions.edit) return;
    const response = await fetch(`/api/tpas/${selectedTpa.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ environment: env, review: reviewDrafts[env] }),
    });
    const data = await response.json();
    if (response.ok) {
      setSelectedTpa(data);
      setTpas((current) => current.map((item) => item.id === data.id ? data : item));
    } else setError(data.error ?? "Could not save review.");
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} /></span>
          <span>TPA <b>Pulse</b></span>
        </div>
        <div className="account-actions">
          <div className="account-copy"><strong>{user.username}</strong><small>{user.role === "admin" ? "Administrator" : "User"}</small></div>
          <button className="icon-button" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
        </div>
      </header>

      <div className="page-shell">
        <section className="hero">
          <div>
            <p className="eyebrow">Operations overview</p>
            <h1>TPA service tracker</h1>
            <p className="hero-copy">A clear view of every administrator, service, and operational gap.</p>
          </div>
          <div className="hero-actions">
            {user.role === "admin" && <button className="button secondary" onClick={openPermissions}><UserRoundCog size={17} /> Permissions</button>}
            {user.permissions.export && <button className="button secondary" onClick={exportCsv} disabled={!tpas.length}>
              <Download size={17} /> Export sheet
            </button>}
            {user.permissions.add && <button className="button primary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Add TPA
            </button>}
          </div>
        </section>

        <div className="environment-bar">
          <div><strong>Environment</strong><span>Statuses and readiness are shown separately.</span></div>
          <div className="environment-switch" role="group" aria-label="Environment">
            <button className={environment === "uat" ? "active" : ""} onClick={() => setEnvironment("uat")}>UAT</button>
            <button className={environment === "prod" ? "active" : ""} onClick={() => setEnvironment("prod")}>Production</button>
          </div>
        </div>

        {showPermissions && (
          <section className="add-panel permissions-panel">
            <div className="panel-heading">
              <div><h2>User permissions</h2><p>Choose which operations each user can perform. Viewing remains enabled.</p></div>
              <button className="icon-button" onClick={() => setShowPermissions(false)} aria-label="Close permissions"><X size={19} /></button>
            </div>
            <div className="permission-list">
              {managedUsers.filter((item) => item.role !== "admin").map((target) => (
                <article className="permission-user" key={target.id}>
                  <div><strong>{target.username}</strong><small>Dashboard access</small></div>
                  <div className="permission-toggles">
                    {(["add", "edit", "delete", "export"] as (keyof UserPermissions)[]).map((permission) => (
                      <label key={permission}><input type="checkbox" checked={target.permissions[permission]} onChange={() => updatePermission(target, permission)} /><span>{permission}</span></label>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="metrics" aria-label="Summary">
          <article className="metric-card">
            <span className="metric-icon blue"><Building2 size={19} /></span>
            <div><p>Total TPAs</p><strong>{environmentTpas.length}</strong></div>
          </article>
          <article className="metric-card">
            <span className="metric-icon green"><Activity size={19} /></span>
            <div><p>Working services</p><strong>{workingCount}<small> / {totalChecks}</small></strong></div>
          </article>
          <article className="metric-card readiness-card">
            <div className="readiness-head"><div><p>Overall readiness</p><strong>{readiness}%</strong></div><span>{readiness >= 80 ? "Healthy" : readiness >= 50 ? "Needs review" : "Action needed"}</span></div>
            <div className="progress"><i style={{ width: `${readiness}%` }} /></div>
          </article>
        </section>

        {showForm && (
          <section className="add-panel">
            <div className="panel-heading">
              <div><h2>Add a new TPA</h2><p>Choose the services that are currently working.</p></div>
              <button className="icon-button" onClick={() => setShowForm(false)} aria-label="Close"><X size={19} /></button>
            </div>
            <form onSubmit={addTpa}>
              <label className="name-field"><span>TPA name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. FHPL" /></label>
              <div className="form-environment-row">
                <span>Configure environment</span>
                <div className="environment-switch compact">
                  <button type="button" className={newEnvironment === "uat" ? "active" : ""} onClick={() => setNewEnvironment("uat")}>UAT</button>
                  <button type="button" className={newEnvironment === "prod" ? "active" : ""} onClick={() => setNewEnvironment("prod")}>Production</button>
                </div>
              </div>
              <div className="service-picker">
                {SERVICES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={newServices[newEnvironment][key] ? "service-option selected" : newServices[newEnvironment][key] === null ? "service-option untracked" : "service-option"}
                    onClick={() => setNewServices((current) => ({
                      ...current,
                      [newEnvironment]: {
                        ...current[newEnvironment],
                        [key]: key === "blacklistedHospitals"
                          ? current[newEnvironment][key] === null ? true : current[newEnvironment][key] === true ? false : null
                          : !current[newEnvironment][key],
                      },
                    }))}
                  >
                    <span>{newServices[newEnvironment][key] === null ? <CircleMinus size={15} /> : newServices[newEnvironment][key] ? <Check size={15} /> : <X size={15} />}</span>
                    <span className="option-copy">{label}{key === "blacklistedHospitals" && <small>{newServices[newEnvironment][key] === null ? "Optional · not tracked" : newServices[newEnvironment][key] ? "Working" : "Not working"}</small>}</span>
                  </button>
                ))}
              </div>
              <label className="review-field"><span>{newEnvironment.toUpperCase()} review</span><textarea value={newReviews[newEnvironment]} onChange={(event) => setNewReviews((current) => ({ ...current, [newEnvironment]: event.target.value }))} placeholder="Add an optional environment review…" /></label>
              <div className="form-actions"><button type="button" className="button ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" type="submit"><Plus size={17} /> Add TPA</button></div>
            </form>
          </section>
        )}

        {error && <div className="error-banner"><X size={16} /> {error}</div>}

        <section className="table-card">
          <div className="table-toolbar">
            <div><h2>Service matrix</h2><p>{user.permissions.edit ? "Click any status to update it instantly." : "View-only access"}</p></div>
            <label className="search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search TPA…" /></label>
          </div>

          {loading ? (
            <div className="empty-state"><div className="spinner" /><p>Loading your workspace…</p></div>
          ) : filteredTpas.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>TPA name</th>{SERVICES.map(({ key, label, shortLabel }) => <th key={key}><span className="wide-label">{label}</span><span className="short-label">{shortLabel}</span></th>)}<th>Details</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {paginatedTpas.map((tpa) => {
                    const tracked = SERVICES.filter(({ key }) => tpa.environments[environment][key] !== null).length;
                    const active = SERVICES.filter(({ key }) => tpa.environments[environment][key] === true).length;
                    return (
                      <tr key={tpa.id}>
                        <td><div className="tpa-name"><span>{tpa.name.slice(0, 2).toUpperCase()}</span><div><strong>{tpa.name}</strong><small>{active} of {tracked} tracked services</small></div></div></td>
                        {SERVICES.map(({ key, label }) => {
                          const working = tpa.environments[environment][key];
                          const stateLabel = working === null ? "not tracked" : working ? "working" : "not working";
                          const nextLabel = working === null ? "start tracking" : working ? "mark not working" : key === "blacklistedHospitals" ? "stop tracking" : "mark working";
                          return <td key={key}><button disabled={!user.permissions.edit || savingKey === `${tpa.id}-${key}`} onClick={() => toggleService(tpa, key)} className={working === null ? "status untracked" : working ? "status working" : "status offline"} aria-label={`${label}: ${stateLabel}`} title={user.permissions.edit ? nextLabel : stateLabel}>{working === null ? <CircleMinus size={17} strokeWidth={2.5} /> : working ? <Check size={17} strokeWidth={3} /> : <X size={17} strokeWidth={3} />}</button></td>;
                        })}
                        <td><button className="details-button" onClick={() => openDetails(tpa)}><Eye size={15} /> View</button></td>
                        <td>{user.permissions.delete && <button className="delete-button" onClick={() => deleteTpa(tpa)} aria-label={`Delete ${tpa.name}`}><Trash2 size={16} /></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredTpas.length > pageSize && (
                <nav className="pagination" aria-label="TPA pagination">
                  <p>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredTpas.length)} of {filteredTpas.length}</p>
                  <div>
                    <button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                      <button key={pageNumber} className={currentPage === pageNumber ? "active" : ""} onClick={() => setPage(pageNumber)} aria-label={`Page ${pageNumber}`} aria-current={currentPage === pageNumber ? "page" : undefined}>{pageNumber}</button>
                    ))}
                    <button disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</button>
                  </div>
                </nav>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <span><Building2 size={25} /></span>
              <h3>{search ? "No matching TPA" : "Your service matrix is ready"}</h3>
              <p>{search ? "Try a different search term." : "Add your first TPA to start tracking service availability."}</p>
              {!search && user.permissions.add && <button className="button primary" onClick={() => setShowForm(true)}><Plus size={17} /> Add first TPA</button>}
            </div>
          )}
        </section>

        <footer><span><i className="legend-dot green-dot" /> Working</span><span><i className="legend-dot red-dot" /> Not working</span><span><i className="legend-dot gray-dot" /> Not tracked</span><p>Changes are saved automatically</p></footer>
      </div>

      {selectedTpa && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedTpa(null); }}>
          <section className="details-modal" role="dialog" aria-modal="true" aria-labelledby="tpa-details-title">
            <div className="panel-heading details-heading">
                  <div><p className="eyebrow">TPA details</p><h2 id="tpa-details-title">{selectedTpa.name}</h2><p>Complete UAT and Production service overview.</p>{selectedTpa.aliases.length > 0 && <div className="alias-list"><strong>Accepted names</strong><span>{selectedTpa.aliases.join(" · ")}</span></div>}</div>
              <button className="icon-button" onClick={() => setSelectedTpa(null)} aria-label="Close details"><X size={20} /></button>
            </div>
            <div className="environment-details-grid">
              {(["uat", "prod"] as EnvironmentKey[]).map((env) => (
                <article className="environment-detail" key={env}>
                  <div className="environment-detail-title"><strong>{env === "uat" ? "UAT" : "Production"}</strong><span>{SERVICES.filter(({ key }) => selectedTpa.environments[env][key] === true).length} working</span></div>
                  <div className="detail-services">
                    {SERVICES.map(({ key, label }) => {
                      const value = selectedTpa.environments[env][key];
                      return <div key={key}><span>{label}</span><b className={value === null ? "detail-state untracked" : value ? "detail-state working" : "detail-state offline"}>{value === null ? <CircleMinus size={14} /> : value ? <Check size={14} /> : <X size={14} />}{value === null ? "Not tracked" : value ? "Working" : "Not working"}</b></div>;
                    })}
                  </div>
                  <label className="review-field"><span>{env.toUpperCase()} review</span><textarea disabled={!user.permissions.edit} value={reviewDrafts[env]} onChange={(event) => setReviewDrafts((current) => ({ ...current, [env]: event.target.value }))} placeholder="No review added." /></label>
                  {user.permissions.edit && <button className="button secondary save-review" onClick={() => saveReview(env)}>Save {env.toUpperCase()} review</button>}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
