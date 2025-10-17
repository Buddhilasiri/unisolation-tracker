import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock, Share2, RefreshCw } from "lucide-react";

/**
 * Unisolation Tracker — V2 (Clean)
 *
 * Goals
 * - Minimal, high-clarity horizontal stepper
 * - Big, glanceable status + what happens next
 * - No database: persist to localStorage (incidentId+machineId key)
 * - Accept context from URL (?incidentId=&machineId=&upn=&bu=&machineName=)
 * - Share read‑only snapshots via URL hash (#state=base64json)
 * - Single CTA based on selected role; minimal chrome
 */

// Flow steps (keep compact and decisive)
const STEPS = [
  { id: "started", label: "Unisolation started" },
  { id: "validated", label: "Inputs validated" },
  { id: "it_sent", label: "IT email sent" },
  { id: "it_ok", label: "IT approved" },
  { id: "hob_sent", label: "HOB email sent" },
  { id: "hob_ok", label: "HOB approved" },
  { id: "unisolate", label: "Unisolation requested" },
  { id: "done", label: "Completed" },
] as const;

type StepId = typeof STEPS[number]["id"];

type Role = "operator" | "it" | "hob";

// Lightweight state type
interface TrackerState {
  incidentId: string;
  machineId: string;
  machineName?: string;
  upn?: string;
  bu?: string;
  active: StepId;                    // current step id
  completed: Record<StepId, string>; // timestamp map
  log: Array<{ ts: string; who: Role; what: string }>; // audit trail
  readonly?: boolean;                // true if opened from snapshot
}

const DEFAULT_STEP: StepId = "started";

const toKey = (i: string, m: string) => `unisov2:${i}:${m}`;

const bootstrap = (): Partial<TrackerState> => {
  const url = new URL(window.location.href);
  const hash = url.hash.replace(/^#state=/, "");
  if (hash) {
    try { return JSON.parse(decodeURIComponent(escape(atob(hash)))); } catch {}
  }
  const incidentId = url.searchParams.get("incidentId") || "";
  const machineId = url.searchParams.get("machineId") || "";
  const upn = url.searchParams.get("upn") || "";
  const bu = url.searchParams.get("bu") || "";
  const machineName = url.searchParams.get("machineName") || "";
  const cached = localStorage.getItem(toKey(incidentId, machineId));
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  return { incidentId, machineId, upn, bu, machineName } as Partial<TrackerState>;
};

const initial = (): TrackerState => {
  const seed = bootstrap();
  const now = new Date().toISOString();
  return {
    incidentId: seed.incidentId || "",
    machineId: seed.machineId || "",
    machineName: seed.machineName || "",
    upn: seed.upn || "",
    bu: seed.bu || "",
    active: DEFAULT_STEP,
    completed: { started: now },
    log: [{ ts: now, who: "operator", what: "Tracker created" }],
    readonly: !!seed.readonly,
  };
};

export default function App() {
  const [state, setState] = useState<TrackerState>(initial());
  const [role, setRole] = useState<Role>("operator");

  // Persist when core fields change
  useEffect(() => {
    if (state.readonly) return;
    if (!state.incidentId || !state.machineId) return;
    localStorage.setItem(toKey(state.incidentId, state.machineId), JSON.stringify(state));
  }, [state]);

  const activeIdx = useMemo(() => STEPS.findIndex(s => s.id === state.active), [state.active]);

  const setActive = (id: StepId, who: Role, note?: string) => {
    if (state.readonly) return;
    const ts = new Date().toISOString();
    setState(s => ({
      ...s,
      active: id,
      completed: { ...s.completed, [id]: s.completed[id] || ts },
      log: [...s.log, { ts, who, what: note || `Moved to: ${id}` }],
    }));
  };

  const share = () => {
    const snap = { ...state, readonly: true };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
    const url = `${window.location.origin}${window.location.pathname}?incidentId=${encodeURIComponent(state.incidentId)}&machineId=${encodeURIComponent(state.machineId)}#state=${b64}`;
    navigator.clipboard.writeText(url);
    alert("Read-only link copied to clipboard.");
  };

  const reset = () => {
    if (!confirm("Reset tracker?")) return;
    const now = new Date().toISOString();
    setState(s => ({
      incidentId: s.incidentId,
      machineId: s.machineId,
      machineName: s.machineName,
      upn: s.upn,
      bu: s.bu,
      active: DEFAULT_STEP,
      completed: { started: now },
      log: [{ ts: now, who: "operator", what: "Tracker reset" }],
      readonly: false,
    }));
  };

  // CTA logic: one button that advances to the next sensible step for each role
  const nextFor = (r: Role): StepId | null => {
    const id = state.active;
    const order = STEPS.map(s => s.id);
    const i = order.indexOf(id);
    // Simple role gates
    const next = order[i + 1] || null; // linear for now
    if (!next) return null;
    if (r === "operator") return next; // operator can move between system steps
    if (r === "it" && (id === "it_sent" || id === "it_ok" || id === "validated")) return "it_ok";
    if (r === "hob" && (id === "hob_sent" || id === "hob_ok" || id === "it_ok")) return "hob_ok";
    return null;
  };

  const advance = () => {
    const n = nextFor(role);
    if (!n) return alert("No permitted next step for this role.");
    const label = STEPS.find(s => s.id === n)?.label || n;
    setActive(n, role, `${role} advanced → ${label}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 text-gray-900">
      {/* Header */}
      <div className="max-w-5xl mx-auto px-6 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Unisolation Tracker</h1>
            <p className="text-sm text-gray-600 mt-1">Incident <span className="font-mono">{state.incidentId || "(unset)"}</span> · Device <span className="font-mono">{state.machineId || "(unset)"}</span></p>
            <p className="text-xs text-gray-500">{state.machineName || "(unknown device)"} · {state.upn || "(user unknown)"} · {state.bu || "(BU unknown)"}</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-xl border bg-white shadow-sm text-sm inline-flex items-center gap-2" onClick={share}><Share2 size={16}/>Share</button>
            <button className="px-3 py-2 rounded-xl border bg-white shadow-sm text-sm inline-flex items-center gap-2" onClick={reset}><RefreshCw size={16}/>Reset</button>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="rounded-2xl bg-white shadow p-6">
          <ol className="grid grid-cols-8 gap-3">
            {STEPS.map((s, idx) => {
              const i = idx;
              const status = i < activeIdx ? "done" : i === activeIdx ? "current" : "pending";
              const base = status === "done" ? "bg-green-500 text-white border-green-500" : status === "current" ? "bg-blue-600 text-white border-blue-600" : "bg-gray-100 text-gray-600 border-gray-300";
              return (
                <li key={s.id} className="flex flex-col items-center">
                  <div className="flex items-center w-full">
                    <div className={`h-1 flex-1 ${i === 0 ? "opacity-0" : i <= activeIdx ? "bg-gradient-to-r from-green-400 to-green-600" : "bg-gray-200"}`}></div>
                    <motion.div
                      className={`w-12 h-12 rounded-full border-2 flex items-center justify-center mx-2 ${base}`}
                      aria-current={status === "current" ? "step" : undefined}
                      initial={{ scale: 0.95 }}
                      animate={{ scale: status === "current" ? 1.05 : 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 20 }}
                      title={s.label}
                    >
                      {status === "done" ? <Check size={18}/> : status === "current" ? <Clock size={18}/> : idx + 1}
                    </motion.div>
                    <div className={`h-1 flex-1 ${i === STEPS.length - 1 ? "opacity-0" : i < activeIdx ? "bg-gradient-to-r from-green-600 to-green-400" : "bg-gray-200"}`}></div>
                  </div>
                  <div className="mt-2 text-center text-[11px] font-medium text-gray-700 max-w-[9rem] leading-snug">{s.label}</div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Primary CTA + Quick edit */}
      <div className="max-w-5xl mx-auto px-6 py-6 grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 rounded-2xl bg-white shadow p-6">
          <h2 className="text-sm font-semibold mb-2">Action</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select className="border rounded-xl px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Select role">
              <option value="operator">Operator</option>
              <option value="it">IT Coordinator</option>
              <option value="hob">HOB</option>
            </select>
            <button onClick={advance} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm shadow hover:bg-blue-700 transition">
              Advance to next step
            </button>
            <span className="text-xs text-gray-500">Single button advances the flow based on role. Replace with signed tokens later.</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white shadow p-6">
          <h2 className="text-sm font-semibold mb-2">Context</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-gray-600">Incident ID</span>
              <input className="w-full border rounded-xl px-3 py-2" value={state.incidentId} onChange={(e)=>setState(s=>({...s,incidentId:e.target.value}))}/>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-600">Machine ID</span>
              <input className="w-full border rounded-xl px-3 py-2" value={state.machineId} onChange={(e)=>setState(s=>({...s,machineId:e.target.value}))}/>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-600">Machine name</span>
              <input className="w-full border rounded-xl px-3 py-2" value={state.machineName||""} onChange={(e)=>setState(s=>({...s,machineName:e.target.value}))}/>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-600">UPN</span>
              <input className="w-full border rounded-xl px-3 py-2" value={state.upn||""} onChange={(e)=>setState(s=>({...s,upn:e.target.value}))}/>
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-xs text-gray-600">Business Unit</span>
              <input className="w-full border rounded-xl px-3 py-2" value={state.bu||""} onChange={(e)=>setState(s=>({...s,bu:e.target.value}))}/>
            </label>
          </div>
        </div>
      </div>

      {/* Audit log (collapsed visual style) */}
      <div className="max-w-5xl mx-auto px-6 pb-10">
        <div className="rounded-2xl bg-white shadow p-6">
          <h2 className="text-sm font-semibold mb-3">Recent activity</h2>
          <ul className="space-y-2 max-h-48 overflow-auto pr-1">
            {state.log.slice().reverse().map((e, i) => (
              <li key={i} className="text-sm flex items-baseline gap-3">
                <span className="text-[11px] text-gray-500 font-mono min-w-[170px]">{new Date(e.ts).toLocaleString()}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{e.who}</span>
                <span className="text-gray-900">{e.what}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-center text-gray-500 mt-3">A11y: current step is indicated via aria-current and text labels; minimize cognitive load with clear labels and linear flow.</p>
      </div>
    </div>
  );
}
