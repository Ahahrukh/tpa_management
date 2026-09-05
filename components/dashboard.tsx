"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  Check,
  Download,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { SERVICES, type ServiceKey, type Tpa } from "@/lib/types";

const emptyServices = Object.fromEntries(SERVICES.map(({ key }) => [key, false])) as Record<ServiceKey, boolean>;

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function Dashboard() {
  const [tpas, setTpas] = useState<Tpa[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [newServices, setNewServices] = useState<Record<ServiceKey, boolean>>(emptyServices);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

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

  const filteredTpas = useMemo(
    () => tpas.filter((tpa) => tpa.name.toLowerCase().includes(search.toLowerCase())),
    [search, tpas],
  );

  const workingCount = tpas.reduce(
    (total, tpa) => total + SERVICES.filter(({ key }) => tpa[key]).length,
    0,
  );
  const totalChecks = tpas.length * SERVICES.length;
  const readiness = totalChecks ? Math.round((workingCount / totalChecks) * 100) : 0;

  async function addTpa(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim()) return setError("Please enter a TPA name.");

    try {
      const response = await fetch("/api/tpas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...newServices }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not add TPA.");
      setTpas((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setNewServices(emptyServices);
      setShowForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add TPA.");
    }
  }

  async function toggleService(tpa: Tpa, field: ServiceKey) {
    const key = `${tpa.id}-${field}`;
    const nextValue = !tpa[field];
    setSavingKey(key);
    setError("");
    setTpas((current) => current.map((item) => (item.id === tpa.id ? { ...item, [field]: nextValue } : item)));

    try {
      const response = await fetch(`/api/tpas/${tpa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: nextValue }),
      });
      if (!response.ok) throw new Error("Could not save this change.");
      const updated = await response.json();
      setTpas((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setTpas((current) => current.map((item) => (item.id === tpa.id ? { ...item, [field]: !nextValue } : item)));
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
    const headers = ["TPA Name", ...SERVICES.map(({ label }) => label)];
    const rows = tpas.map((tpa) => [
      tpa.name,
      ...SERVICES.map(({ key }) => (tpa[key] ? "Working" : "Not working")),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => escapeCsv(cell)).join(",")).join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tpa-status-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} /></span>
          <span>TPA <b>Pulse</b></span>
        </div>
        <div className="live-status"><span /> Operational workspace</div>
      </header>

      <div className="page-shell">
        <section className="hero">
          <div>
            <p className="eyebrow">Operations overview</p>
            <h1>TPA service tracker</h1>
            <p className="hero-copy">A clear view of every administrator, service, and operational gap.</p>
          </div>
          <div className="hero-actions">
            <button className="button secondary" onClick={exportCsv} disabled={!tpas.length}>
              <Download size={17} /> Export sheet
            </button>
            <button className="button primary" onClick={() => setShowForm(true)}>
              <Plus size={18} /> Add TPA
            </button>
          </div>
        </section>

        <section className="metrics" aria-label="Summary">
          <article className="metric-card">
            <span className="metric-icon blue"><Building2 size={19} /></span>
            <div><p>Total TPAs</p><strong>{tpas.length}</strong></div>
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
              <div className="service-picker">
                {SERVICES.map(({ key, label }) => (
                  <button key={key} type="button" className={newServices[key] ? "service-option selected" : "service-option"} onClick={() => setNewServices((current) => ({ ...current, [key]: !current[key] }))}>
                    <span>{newServices[key] ? <Check size={15} /> : <X size={15} />}</span>{label}
                  </button>
                ))}
              </div>
              <div className="form-actions"><button type="button" className="button ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" type="submit"><Plus size={17} /> Add TPA</button></div>
            </form>
          </section>
        )}

        {error && <div className="error-banner"><X size={16} /> {error}</div>}

        <section className="table-card">
          <div className="table-toolbar">
            <div><h2>Service matrix</h2><p>Click any status to update it instantly.</p></div>
            <label className="search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search TPA…" /></label>
          </div>

          {loading ? (
            <div className="empty-state"><div className="spinner" /><p>Loading your workspace…</p></div>
          ) : filteredTpas.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>TPA name</th>{SERVICES.map(({ key, label, shortLabel }) => <th key={key}><span className="wide-label">{label}</span><span className="short-label">{shortLabel}</span></th>)}<th aria-label="Actions" /></tr></thead>
                <tbody>
                  {filteredTpas.map((tpa) => {
                    const active = SERVICES.filter(({ key }) => tpa[key]).length;
                    return (
                      <tr key={tpa.id}>
                        <td><div className="tpa-name"><span>{tpa.name.slice(0, 2).toUpperCase()}</span><div><strong>{tpa.name}</strong><small>{active} of {SERVICES.length} services</small></div></div></td>
                        {SERVICES.map(({ key, label }) => {
                          const working = tpa[key];
                          return <td key={key}><button disabled={savingKey === `${tpa.id}-${key}`} onClick={() => toggleService(tpa, key)} className={working ? "status working" : "status offline"} aria-label={`${label}: ${working ? "working" : "not working"}`} title={`Mark ${working ? "not working" : "working"}`}>{working ? <Check size={17} strokeWidth={3} /> : <X size={17} strokeWidth={3} />}</button></td>;
                        })}
                        <td><button className="delete-button" onClick={() => deleteTpa(tpa)} aria-label={`Delete ${tpa.name}`}><Trash2 size={16} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <span><Building2 size={25} /></span>
              <h3>{search ? "No matching TPA" : "Your service matrix is ready"}</h3>
              <p>{search ? "Try a different search term." : "Add your first TPA to start tracking service availability."}</p>
              {!search && <button className="button primary" onClick={() => setShowForm(true)}><Plus size={17} /> Add first TPA</button>}
            </div>
          )}
        </section>

        <footer><span><i className="legend-dot green-dot" /> Working</span><span><i className="legend-dot red-dot" /> Not working</span><p>Changes are saved automatically</p></footer>
      </div>
    </main>
  );
}
