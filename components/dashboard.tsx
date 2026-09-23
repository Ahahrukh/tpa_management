"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  Check,
  CircleMinus,
  Download,
  Eye,
  FileSpreadsheet,
  LogOut,
  Plus,
  PencilLine,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { SERVICES, type AuthUser, type EnvironmentKey, type ServiceKey, type Tpa, type UserPermissions } from "@/lib/types";

const RAHA_BACKEND_URL = process.env.NEXT_PUBLIC_RAHA_BACKEND_URL ?? "https://prodbackend.rahainsure.com";

type TpaRealtimeAlert = {
  id?: string;
  _id?: string;
  tpa_name?: string;
  service_type?: string;
  service_label?: string;
  message?: string;
  company_name?: string;
  employee_name?: string;
  employee_code?: string;
  policy_number?: string;
  api_endpoint?: string;
  request_payload?: unknown;
  response_payload?: unknown;
  error_response?: unknown;
  status_code?: number;
  start_date?: string;
  end_date?: string;
  failed_at?: string;
  createdAt?: string;
};

const createEmptyServices = () => Object.fromEntries(
  SERVICES.map(({ key }) => [key, key === "blacklistedHospitals" ? null : false]),
) as Record<ServiceKey, boolean | null>;

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function getFailureResponses(alert: TpaRealtimeAlert) {
  const payload = alert.response_payload as Record<string, unknown> | undefined;
  const wrapped = payload && typeof payload === "object" &&
    ("raha_api_response" in payload || "tpa_response" in payload);

  return {
    rahaResponse: wrapped
      ? payload.raha_api_response
      : {
          status: "failed",
          status_code: alert.status_code,
          message: alert.message,
        },
    tpaResponse: wrapped
      ? payload.tpa_response
      : alert.response_payload ?? alert.error_response ?? null,
  };
}

function getTrackerServiceKey(serviceType?: string): ServiceKey | null {
  switch (serviceType) {
    case "claims_history": return "claimsHistory";
    case "ecard": return "ecard";
    case "network_hospitals": return "networkHospital";
    case "enrollment_data": return "activeListEnrollment";
    case "intimation_api": return "claimIntimation";
    default: return null;
  }
}

export default function Dashboard({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [tpas, setTpas] = useState<Tpa[]>([]);
  const [alerts, setAlerts] = useState<TpaRealtimeAlert[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
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
  const [workspace, setWorkspace] = useState<"services" | "failures" | "corrections" | "reports">("services");
  const [clients, setClients] = useState<{ _id: string; company_name: string }[]>([]);
  const [trackerCompanyId, setTrackerCompanyId] = useState("");
  const [trackerModel, setTrackerModel] = useState("onboarding");
  const [trackerEmployees, setTrackerEmployees] = useState<Record<string, any>[]>([]);
  const [trackerEmployeeId, setTrackerEmployeeId] = useState("");
  const [correctionField, setCorrectionField] = useState("email");
  const [correctionValue, setCorrectionValue] = useState("");
  const [trackerPolicies, setTrackerPolicies] = useState<Record<string, any>[]>([]);
  const [reportPolicyId, setReportPolicyId] = useState("");
  const [reportSource, setReportSource] = useState("database");
  const [showCorrectionConfirmation, setShowCorrectionConfirmation] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<TpaRealtimeAlert | null>(null);
  const [failurePage, setFailurePage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);

  async function persistFailureStatus(alert: TpaRealtimeAlert) {
    const serviceKey = getTrackerServiceKey(alert.service_type);
    if (!serviceKey || !alert.tpa_name) return;

    const response = await fetch("/api/service-failures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tpaName: alert.tpa_name,
        serviceName: serviceKey,
        environment: "prod",
        reason: alert.message || "TPA API failed",
        failedAt: alert.failed_at ?? alert.createdAt,
        // Failure details remain in Raha; this only synchronizes the matrix.
        recordEvent: false,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Could not persist TPA failure status.");
    const updatedTpas = Array.isArray(data?.tpas) ? data.tpas as Tpa[] : data?.tpa ? [data.tpa as Tpa] : [];
    if (updatedTpas.length) {
      const byId = new Map(updatedTpas.map((tpa) => [tpa.id, tpa]));
      setTpas((current) => current.map((tpa) => byId.get(tpa.id) ?? tpa));
    }
  }

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
    fetch("/api/tracker/clients", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || data?.error || "Could not load clients from Raha backend.");
        return data;
      })
      .then((data) => setClients(Array.isArray(data?.data) ? data.data : []))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load clients from Raha backend."));
  }, []);

  useEffect(() => {
    if (!trackerCompanyId) { setTrackerPolicies([]); setTrackerEmployees([]); return; }
    fetch(`/api/tracker/clients/${trackerCompanyId}/policies`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || data?.error || "Could not load policies.");
        return data;
      })
      .then((data) => setTrackerPolicies(Array.isArray(data?.data) ? data.data : []))
      .catch(() => undefined);
    if (workspace === "corrections") {
      fetch(`/api/tracker/employees?company_id=${trackerCompanyId}&model=${trackerModel}`, { cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((data) => { setTrackerEmployees(Array.isArray(data?.data) ? data.data : []); setTrackerEmployeeId(""); })
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load employees."));
    }
  }, [trackerCompanyId, trackerModel, workspace]);

  const selectedTrackerEmployee = trackerEmployees.find((employee) => `${employee._id}` === trackerEmployeeId);
  const selectedReportPolicy = trackerPolicies.find((policy) => `${policy._id}` === reportPolicyId);
  const failurePageSize = 8;
  const totalFailurePages = Math.max(1, Math.ceil(alerts.length / failurePageSize));
  const visibleFailures = alerts.slice((Math.min(failurePage, totalFailurePages) - 1) * failurePageSize, Math.min(failurePage, totalFailurePages) * failurePageSize);
  const alertPageSize = 10;
  const alertTotalPages = Math.max(1, Math.ceil(alerts.length / alertPageSize));
  const visibleStreamAlerts = alerts.slice(
    (Math.min(alertPage, alertTotalPages) - 1) * alertPageSize,
    Math.min(alertPage, alertTotalPages) * alertPageSize,
  );
  useEffect(() => {
    if (!selectedTrackerEmployee) return;
    const fieldMap: Record<string, string> = { employee_code: "user_emp_id", name: "user_first_name", dob: "user_dob", email: "user_email_id", mobile: "user_phone_number" };
    setCorrectionValue(`${selectedTrackerEmployee[fieldMap[correctionField]] ?? ""}`);
  }, [selectedTrackerEmployee, correctionField]);

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

  useEffect(() => {
    let active = true;
    fetch(`${RAHA_BACKEND_URL}/api/v2/raha_user_master/tpa_failure_alerts?perPage=500`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        const existingAlerts = Array.isArray(data?.data) ? data.data : [];
        if (active) {
          setAlerts(existingAlerts);
          // The tracker may open after a TPA failure. Synchronize persisted
          // alerts as well as live socket events.
          existingAlerts.forEach((alert: TpaRealtimeAlert) => {
            void persistFailureStatus(alert).catch((caught: unknown) =>
              setError(caught instanceof Error ? caught.message : "Could not synchronize TPA failure status."),
            );
          });
        }
      })
      .catch(() => undefined);

    let socket: { on: (event: string, callback: (...args: any[]) => void) => void; disconnect: () => void } | undefined;
    import("socket.io-client")
      .then(({ io }) => {
        if (!active) return;
        socket = io(RAHA_BACKEND_URL, { transports: ["websocket", "polling"] });
        socket.on("connect", () => setSocketConnected(true));
        socket.on("disconnect", () => setSocketConnected(false));
    socket.on("tpa_failure_alert", (alert: TpaRealtimeAlert) => {
          setAlerts((current) => [alert, ...current].slice(0, 100));
          setFailurePage(1);
          setAlertPage(1);
          const serviceKey = getTrackerServiceKey(alert.service_type);
          if (serviceKey && alert.tpa_name) {
            void persistFailureStatus(alert)
              .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not persist TPA failure status."));
          }
          setTpas((current) =>
            current.map((tpa) => {
              const alertTpaName = alert.tpa_name?.toLowerCase().replace(/[^a-z0-9]/g, "");
              const matchesTpa = Boolean(
                alertTpaName &&
                  (tpa.name.toLowerCase().replace(/[^a-z0-9]/g, "") === alertTpaName ||
                    tpa.aliases.some((alias) => alias.toLowerCase().replace(/[^a-z0-9]/g, "") === alertTpaName) ||
                    (alertTpaName.includes("goodhealth") && tpa.name === "GHPL") ||
                    (alertTpaName.includes("bajaj") && tpa.name === "Bajaj Allianz")),
              );
              if (!matchesTpa) return tpa;
              if (!serviceKey) return tpa;
              return {
                ...tpa,
                environments: {
                  ...tpa.environments,
                  prod: { ...tpa.environments.prod, [serviceKey]: false },
                },
              };
            }),
          );
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
      socket?.disconnect();
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

  async function submitEmployeeCorrection() {
    if (!trackerEmployeeId || !correctionValue.trim()) return setError("Select an employee and enter the replacement value.");
    const response = await fetch(`/api/tracker/employees/${trackerEmployeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: trackerModel, field: correctionField, value: correctionValue, confirmed: true }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.message ?? "Employee update failed.");
    setError("");
    setShowCorrectionConfirmation(false);
    setTrackerEmployees((current) => current.map((item) => item._id === trackerEmployeeId ? { ...item, user_emp_id: correctionField === "employee_code" ? correctionValue : item.user_emp_id, user_first_name: correctionField === "name" ? correctionValue : item.user_first_name, user_dob: correctionField === "dob" ? correctionValue : item.user_dob, user_email_id: correctionField === "email" ? correctionValue : item.user_email_id, user_phone_number: correctionField === "mobile" ? correctionValue : item.user_phone_number } : item));
  }

  async function downloadClaimsReport() {
    if (!trackerCompanyId || !reportPolicyId) return setError("Select a client and policy first.");
    const response = await fetch(`/api/tracker/claims_report?company_id=${trackerCompanyId}&policy_id=${reportPolicyId}&source=${reportSource}`);
    if (!response.ok) { const data = await response.json().catch(() => ({})); return setError(data.message ?? "Could not generate claims report."); }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = response.headers.get("content-disposition")?.match(/filename=([^;]+)/)?.[1] ?? "raha-claims-report.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} /></span>
          <span>RAHA <b>TPA-TRACKER</b></span>
        </div>
        <div className="account-actions">
          <div className="account-copy"><strong>{user.username}</strong><small>{user.role === "admin" ? "Administrator" : "User"}</small></div>
          <button className="icon-button" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={18} /></button>
        </div>
      </header>

      <div className="tracker-layout">
        <aside className="tracker-sidebar" aria-label="TPA tracker navigation">
          <p>Workspace</p>
          {[["services", "TPA status", Activity], ["failures", "TPA failures", AlertTriangle], ["corrections", "Employee edit", PencilLine], ["reports", "Claims reports", FileSpreadsheet]].map(([key, label, Icon]) => {
            const NavIcon = Icon as typeof Activity;
            return <button key={key as string} className={workspace === key ? "active" : ""} onClick={() => setWorkspace(key as typeof workspace)}><NavIcon size={17} />{label as string}</button>;
          })}
          <div className="sidebar-bottom" aria-live="polite">
            <span className={socketConnected ? "sidebar-status-dot connected" : "sidebar-status-dot"} />
            <div><strong>Production</strong><small>{socketConnected ? "Live tracker connection" : "Reconnecting tracker"}</small></div>
          </div>
        </aside>
        <div className="tracker-workspace">
        {workspace === "services" && <div className="page-shell">
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

        <section className="alert-stream" aria-label="TPA realtime alerts">
          <div className="alert-stream-head">
            <div><Bell size={18} /><strong>Realtime TPA alerts</strong><span>{socketConnected ? "Live" : "Connecting"}</span></div>
            <small>{RAHA_BACKEND_URL}</small>
          </div>
          {alerts.length ? (
            <div className="alert-list">
              {visibleStreamAlerts.map((alert, index) => (
                <article className="alert-item" key={alert.id ?? alert._id ?? `${alert.tpa_name}-${index}`}>
                  <span className="alert-icon"><AlertTriangle size={16} /></span>
                  <div>
                    <strong>{alert.tpa_name ?? "TPA"} · {alert.service_label ?? alert.service_type ?? "API"}</strong>
                    <p>{alert.message ?? "TPA API failed"}</p>
                    <small>
                      {[alert.company_name, alert.employee_name || alert.employee_code, alert.policy_number, alert.api_endpoint].filter(Boolean).join(" · ")}
                    </small>
                    {(alert.start_date || alert.end_date) && <small>{alert.start_date ?? "-"} to {alert.end_date ?? "-"}</small>}
                  </div>
                  <time>{new Date(alert.failed_at ?? alert.createdAt ?? Date.now()).toLocaleString("en-IN")}</time>
                </article>
              ))}
            </div>
          ) : (
            <div className="alert-empty">No TPA failure alerts yet.</div>
          )}
          {alerts.length > alertPageSize && <nav className="pagination alert-pagination" aria-label="Realtime alert pagination"><p>Showing {(Math.min(alertPage, alertTotalPages) - 1) * alertPageSize + 1}–{Math.min(Math.min(alertPage, alertTotalPages) * alertPageSize, alerts.length)} of {alerts.length} alerts</p><div><button disabled={alertPage === 1} onClick={() => setAlertPage((value) => Math.max(1, value - 1))}>Previous</button><button disabled={alertPage === alertTotalPages} onClick={() => setAlertPage((value) => Math.min(alertTotalPages, value + 1))}>Next</button></div></nav>}
        </section>

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
        </div>}

        {workspace === "failures" && <section className="page-shell workspace-panel"><div className="workspace-heading"><p className="eyebrow">Live operations</p><h1>TPA failures</h1><p>Every traced TPA failure is stored in Raha and arrives here through the socket stream.</p></div><section className="failure-table"><div className="failure-table-head"><div><strong>{alerts.length}</strong><span>events captured</span></div><span className={socketConnected ? "live-pill connected" : "live-pill"}>{socketConnected ? "Live socket" : "Connecting"}</span></div>{alerts.length ? <><div className="failure-table-scroll"><table><thead><tr><th>TPA</th><th>Service</th><th>Failure</th><th>Endpoint</th><th>Occurred</th><th /></tr></thead><tbody>{visibleFailures.map((alert, index) => <tr key={alert.id ?? alert._id ?? `${alert.tpa_name}-${index}`}><td><strong>{alert.tpa_name ?? "TPA"}</strong></td><td><span className="service-chip">{alert.service_label ?? alert.service_type ?? "API"}</span></td><td className="failure-message">{alert.message ?? "TPA API failed"}</td><td className="endpoint-cell" title={alert.api_endpoint}>{alert.api_endpoint || "-"}</td><td>{new Date(alert.failed_at ?? alert.createdAt ?? Date.now()).toLocaleString("en-IN")}</td><td><button className="details-button" onClick={() => setSelectedAlert(alert)}><Eye size={15} /> Inspect</button></td></tr>)}</tbody></table></div><nav className="pagination"><p>Showing {(Math.min(failurePage, totalFailurePages) - 1) * failurePageSize + 1}–{Math.min(Math.min(failurePage, totalFailurePages) * failurePageSize, alerts.length)} of {alerts.length}</p><div><button disabled={failurePage === 1} onClick={() => setFailurePage((page) => Math.max(1, page - 1))}>Previous</button><button disabled={failurePage === totalFailurePages} onClick={() => setFailurePage((page) => Math.min(totalFailurePages, page + 1))}>Next</button></div></nav></> : <div className="alert-empty">No TPA failures have been recorded.</div>}</section></section>}

        {workspace === "corrections" && <section className="page-shell workspace-panel"><div className="workspace-heading"><p className="eyebrow">Controlled correction</p><h1>Edit employee data</h1><p>Select a client, employee data model, and one permitted field. Every confirmed update is audit logged.</p></div><section className="add-panel tracker-form"><div className="form-grid"><label className="name-field"><span>Role</span><input value="Employee" disabled /></label><label className="name-field"><span>Model</span><select value={trackerModel} onChange={(event) => setTrackerModel(event.target.value)}><option value="onboarding">Onboarding</option><option value="pre_enrollment">Pre enrollment</option></select></label><label className="name-field"><span>Client</span><select value={trackerCompanyId} onChange={(event) => setTrackerCompanyId(event.target.value)}><option value="">Select client</option>{clients.map((client) => <option key={client._id} value={client._id}>{client.company_name}</option>)}</select></label><label className="name-field"><span>Employee</span><select disabled={!trackerCompanyId} value={trackerEmployeeId} onChange={(event) => setTrackerEmployeeId(event.target.value)}><option value="">Select employee</option>{trackerEmployees.map((employee) => <option key={employee._id} value={employee._id}>{employee.user_first_name} {employee.user_last_name || ""} ({employee.user_emp_id || "No code"})</option>)}</select></label><label className="name-field"><span>Change</span><select value={correctionField} onChange={(event) => setCorrectionField(event.target.value)}><option value="employee_code">Employee code</option><option value="name">Name</option><option value="dob">DOB</option><option value="email">Email</option><option value="mobile">Mobile</option></select></label><label className="name-field"><span>New value</span><input type={correctionField === "dob" ? "date" : "text"} disabled={!trackerEmployeeId} value={correctionValue} onChange={(event) => setCorrectionValue(event.target.value)} /></label></div><div className="form-actions"><button className="button primary" disabled={!trackerEmployeeId || !correctionValue.trim()} onClick={() => setShowCorrectionConfirmation(true)}><Users size={17} />Review and update</button></div></section></section>}

        {workspace === "reports" && <section className="page-shell workspace-panel"><div className="workspace-heading"><p className="eyebrow">Client reporting</p><h1>Claims reports</h1><p>Generate a CSV from the Raha database or directly from the TPA configured on the selected policy.</p></div><section className="add-panel tracker-form"><div className="form-grid"><label className="name-field"><span>Client</span><select value={trackerCompanyId} onChange={(event) => { setTrackerCompanyId(event.target.value); setReportPolicyId(""); }}><option value="">Select client</option>{clients.map((client) => <option key={client._id} value={client._id}>{client.company_name}</option>)}</select></label><label className="name-field"><span>Source</span><select value={reportSource} onChange={(event) => setReportSource(event.target.value)}><option value="database">Raha database</option><option value="tpa">Direct from policy TPA</option></select></label><label className="name-field form-span"><span>Policy / TPA</span><select value={reportPolicyId} onChange={(event) => setReportPolicyId(event.target.value)} disabled={!trackerCompanyId}><option value="">Select policy</option>{trackerPolicies.map((policy) => <option key={policy._id} value={policy._id}>{policy.policy_number} · {policy.insurer_details?.tpa_name || "TPA not configured"}</option>)}</select></label></div>{selectedReportPolicy && <div className="policy-source-summary"><span>Selected provider</span><strong>{selectedReportPolicy.insurer_details?.tpa_name || "TPA not configured"}</strong><small>{reportSource === "tpa" ? "The report will request fresh claims from this TPA." : "The report will use claims stored in Raha."}</small></div>}<div className="form-actions"><button className="button primary" disabled={!trackerCompanyId || !reportPolicyId} onClick={downloadClaimsReport}><Download size={17} />Generate CSV</button></div></section></section>}
        </div>
      </div>

      {selectedTpa && workspace === "services" && (
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
      {showCorrectionConfirmation && <div className="modal-backdrop" role="presentation"><section className="confirmation-modal" role="dialog" aria-modal="true"><p className="eyebrow">Confirm change</p><h2>Are you sure?</h2><p>Update <b>{correctionField.replace("_", " ")}</b> to <b>{correctionValue}</b> for <b>{selectedTrackerEmployee?.user_first_name || "this employee"}</b>? The change will be recorded in the audit trail.</p><div className="form-actions"><button className="button ghost" onClick={() => setShowCorrectionConfirmation(false)}>Cancel</button><button className="button primary" onClick={submitEmployeeCorrection}>I agree, update</button></div></section></div>}
      {selectedAlert && (() => { const responses = getFailureResponses(selectedAlert); return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAlert(null); }}><section className="details-modal failure-details-modal" role="dialog" aria-modal="true"><div className="panel-heading"><div><p className="eyebrow">TPA failure event</p><h2>{selectedAlert.tpa_name} · {selectedAlert.service_label ?? selectedAlert.service_type}</h2><p>{selectedAlert.message}</p></div><button className="icon-button" onClick={() => setSelectedAlert(null)} aria-label="Close failure details"><X size={20} /></button></div><div className="failure-meta"><span>Endpoint: {selectedAlert.api_endpoint || "-"}</span><span>Time: {new Date(selectedAlert.failed_at ?? selectedAlert.createdAt ?? Date.now()).toLocaleString("en-IN")}</span></div><div className="failure-payloads"><section><h3>Raha request</h3><pre>{JSON.stringify(selectedAlert.request_payload ?? {}, null, 2)}</pre></section><section><h3>Raha API response</h3><pre>{JSON.stringify(responses.rahaResponse, null, 2)}</pre></section><section className="tpa-response-panel"><h3>TPA response / error</h3><pre>{JSON.stringify(responses.tpaResponse, null, 2)}</pre></section></div></section></div>; })()}
    </main>
  );
}
