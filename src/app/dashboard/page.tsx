"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  getSlaHours,
  reasonLabel as getReasonLabel,
  statusBadgeClasses,
  type ActiveLoan,
} from "@/lib/loans";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentActivity {
  loan_id: string;
  device_name: string;
  borrower_name: string;
  loaned_at: string;
  returned_at: string | null;
  reason: string | null;
}

interface DeviceUsage {
  device_name: string;
  count: number;
}

interface BorrowerUsage {
  borrower_name: string;
  count: number;
}

interface ReasonCount {
  reason: string;
  count: number;
}

// ─── Helpers locais ───────────────────────────────────────────────────────────

function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  return `${d}d ${h}h`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Mini Bar ─────────────────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-5 text-right opacity-60">{value}</span>
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

function DonutChart({ data, total }: { data: ReasonCount[]; total: number }) {
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];
  let offset = 0;
  const radius = 36;
  const circ = 2 * Math.PI * radius;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90 flex-shrink-0">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="14" className="opacity-5" />
        {data.map((d, i) => {
          const pct = total > 0 ? d.count / total : 0;
          const dash = pct * circ;
          const gap = circ - dash;
          const el = (
            <circle key={i} cx="50" cy="50" r={radius} fill="none"
              stroke={colors[i % colors.length]} strokeWidth="14"
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset * circ} />
          );
          offset += pct;
          return el;
        })}
        <text x="50" y="54" textAnchor="middle" className="fill-current" fontSize="14" fontWeight="700"
          style={{ transform: "rotate(90deg)", transformOrigin: "50px 50px" }}>
          {total}
        </text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {data.slice(0, 4).map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="opacity-70 truncate max-w-[80px]">{getReasonLabel(d.reason)}</span>
            <span className="font-semibold ml-auto pl-2">{total > 0 ? Math.round((d.count / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [activeLoans, setActiveLoans] = useState<ActiveLoan[]>([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [loansToday, setLoansToday] = useState(0);
  const [loansTodayDelta, setLoansTodayDelta] = useState(0);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [topDevices, setTopDevices] = useState<DeviceUsage[]>([]);
  const [topBorrowers, setTopBorrowers] = useState<BorrowerUsage[]>([]);
  const [reasonBreakdown, setReasonBreakdown] = useState<ReasonCount[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = createClient();
    const now = new Date();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      { data: rawLoans },
      { count: devCount },
      { data: todayLoans },
      { data: yesterdayLoans },
      { data: activity },
      { data: allLoansMonth },
    ] = await Promise.all([
      sb.from("loans")
        .select("id, borrower_name, reason, reason_detail, custom_deadline_hours, loaned_at, devices(id, name, qr_code)")
        .eq("status", "active")
        .order("loaned_at", { ascending: true }),
      sb.from("devices").select("*", { count: "exact", head: true }),
      sb.from("loans").select("id").gte("loaned_at", todayStart.toISOString()),
      sb.from("loans").select("id")
        .gte("loaned_at", yesterdayStart.toISOString())
        .lt("loaned_at", todayStart.toISOString()),
      sb.from("loans")
        .select("id, borrower_name, reason, loaned_at, returned_at, devices(name)")
        .order("loaned_at", { ascending: false })
        .limit(8),
      sb.from("loans")
        .select("borrower_name, reason, devices(name)")
        .gte("loaned_at", monthStart.toISOString()),
    ]);

    if (rawLoans) {
      const mapped: ActiveLoan[] = rawLoans.map((r: any) => ({
        id: r.id,
        device_id: r.devices?.id ?? "",
        device_name: r.devices?.name ?? "—",
        qr_code: r.devices?.qr_code ?? "",
        borrower_name: r.borrower_name ?? "—",
        loaned_at: r.loaned_at,
        reason: r.reason,
        reason_detail: r.reason_detail ?? null,
        custom_deadline_hours: r.custom_deadline_hours ?? null,
      }));
      mapped.sort((a, b) => {
        const elA = (Date.now() - new Date(a.loaned_at).getTime()) / 3_600_000;
        const elB = (Date.now() - new Date(b.loaned_at).getTime()) / 3_600_000;
        return elB - elA;
      });
      setActiveLoans(mapped);
    }

    setTotalDevices(devCount ?? 0);
    setLoansToday(todayLoans?.length ?? 0);
    setLoansTodayDelta((todayLoans?.length ?? 0) - (yesterdayLoans?.length ?? 0));

    if (activity) {
      setRecentActivity(activity.map((r: any) => ({
        loan_id: r.id,
        device_name: r.devices?.name ?? "—",
        borrower_name: r.borrower_name ?? "—",
        loaned_at: r.loaned_at,
        returned_at: r.returned_at,
        reason: r.reason,
      })));
    }

    if (allLoansMonth) {
      const devMap: Record<string, number> = {};
      const borrowerMap: Record<string, number> = {};
      const reasonMap: Record<string, number> = {};
      allLoansMonth.forEach((r: any) => {
        const dn = r.devices?.name ?? "—";
        const bn = r.borrower_name ?? "—";
        const rk = r.reason ?? "outro";
        devMap[dn] = (devMap[dn] ?? 0) + 1;
        borrowerMap[bn] = (borrowerMap[bn] ?? 0) + 1;
        reasonMap[rk] = (reasonMap[rk] ?? 0) + 1;
      });
      setTopDevices(
        Object.entries(devMap)
          .map(([device_name, count]) => ({ device_name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      );
      setTopBorrowers(
        Object.entries(borrowerMap)
          .map(([borrower_name, count]) => ({ borrower_name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      );
      setReasonBreakdown(
        Object.entries(reasonMap)
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count)
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const available = totalDevices - activeLoans.length;
  const overdue = activeLoans.filter((l) => {
    const elapsed = (Date.now() - new Date(l.loaned_at).getTime()) / 3_600_000;
    return elapsed >= getSlaHours(l.reason, l.custom_deadline_hours);
  }).length;
  const filtered = activeLoans.filter(
    (l) =>
      l.device_name.toLowerCase().includes(search.toLowerCase()) ||
      l.borrower_name.toLowerCase().includes(search.toLowerCase())
  );
  const totalMonthLoans = topDevices.reduce((a, b) => a + b.count, 0);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5 pb-24 md:pb-6">

      {/* Busca — visível apenas no mobile (desktop usa o GlobalHeader) */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
        <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 fill-none stroke-current opacity-40" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/></svg>
        <input
          type="text"
          placeholder="Buscar iPad ou usuário..."
          className="bg-transparent outline-none flex-1 placeholder:opacity-60"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Metric Cards — 2 colunas no mobile, 5 no desktop ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        {[
          {
            label: "Disponíveis",
            value: loading ? "—" : available,
            sub: totalDevices > 0 ? `${Math.round((available / totalDevices) * 100)}% do total` : "—",
            icon: "M12 18H6a2 2 0 01-2-2V8a2 2 0 012-2h12a2 2 0 012 2v4",
            color: "text-emerald-500", barColor: "bg-emerald-500",
            barPct: totalDevices > 0 ? (available / totalDevices) * 100 : 0,
          },
          {
            label: "Emprestados",
            value: loading ? "—" : activeLoans.length,
            sub: totalDevices > 0 ? `${Math.round((activeLoans.length / totalDevices) * 100)}% do total` : "—",
            icon: "M7 11l5-5m0 0l5 5m-5-5v12",
            color: "text-blue-500", barColor: "bg-blue-500",
            barPct: totalDevices > 0 ? (activeLoans.length / totalDevices) * 100 : 0,
          },
          {
            label: "Em atraso",
            value: loading ? "—" : overdue,
            sub: activeLoans.length > 0 ? `${Math.round((overdue / activeLoans.length) * 100)}% dos emprestados` : "—",
            icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
            color: "text-red-500", barColor: "bg-red-500",
            barPct: activeLoans.length > 0 ? (overdue / activeLoans.length) * 100 : 0,
          },
          {
            label: "Empréstimos hoje",
            value: loading ? "—" : loansToday,
            sub: loansTodayDelta >= 0 ? `+${loansTodayDelta} vs ontem` : `${loansTodayDelta} vs ontem`,
            icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
            color: "text-purple-500", barColor: "bg-purple-500",
            barPct: Math.min(loansToday * 5, 100),
          },
          {
            label: "Total de iPads",
            value: loading ? "—" : totalDevices,
            sub: "cadastrados",
            icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
            color: "text-cyan-500", barColor: "bg-cyan-500",
            barPct: 100,
          },
        ].map((card) => (
          <div key={card.label} className="rounded-xl p-4 border transition-colors bg-surface-container border-black/5 dark:border-white/5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-black/3 dark:bg-white/5">
                <svg viewBox="0 0 24 24" className={`w-4 h-4 fill-none stroke-current ${card.color}`} strokeWidth="1.8">
                  <path d={card.icon} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold tracking-tight">{card.value}</p>
            <p className="text-xs font-medium mt-0.5 text-black/50 dark:text-white/60">{card.label}</p>
            <div className="mt-2 h-1 rounded-full overflow-hidden bg-black/5 dark:bg-white/5">
              <div className={`h-full rounded-full ${card.barColor}`} style={{ width: `${card.barPct}%` }} />
            </div>
            <p className="text-[10px] mt-1.5 text-black/30 dark:text-white/30">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Active Loans + Alerts ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl border transition-colors bg-surface-container border-black/5 dark:border-white/5">
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <h2 className="font-semibold text-sm">Empréstimos ativos</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300">
                {activeLoans.length} no total
              </span>
            </div>
            <a href="/emprestar" className="text-xs font-medium transition-colors text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
              + Novo empréstimo
            </a>
          </div>

          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-medium border-b text-black/30 dark:text-white/30 border-black/5 dark:border-white/5">
                  <th className="text-left px-5 py-2.5">iPad</th>
                  <th className="text-left px-3 py-2.5">Usuário</th>
                  <th className="text-left px-3 py-2.5 hidden sm:table-cell">Desde</th>
                  <th className="text-left px-3 py-2.5">Tempo</th>
                  <th className="text-left px-3 py-2.5 hidden md:table-cell">Motivo</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-3 rounded bg-black/5 dark:bg-white/5 animate-pulse" style={{ width: `${60 + j * 10}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.slice(0, 6).map((loan) => {
                  const elapsed = (Date.now() - new Date(loan.loaned_at).getTime()) / 3_600_000;
                  const sla = getSlaHours(loan.reason, loan.custom_deadline_hours);
                  const isOverdue = elapsed >= sla;
                  const isWarning = !isOverdue && elapsed >= sla * 0.75;
                  return (
                    <tr key={loan.id} className="transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.03]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-black/3 dark:bg-white/5">
                            <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current opacity-50" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01" strokeLinecap="round"/></svg>
                          </div>
                          <span className="font-medium text-xs">{loan.device_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-xs font-medium">{loan.borrower_name}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-black/50 dark:text-white/50 hidden sm:table-cell">{formatDate(loan.loaned_at)}</td>
                      <td className={`px-3 py-3 text-xs font-mono ${isOverdue ? "text-red-500" : isWarning ? "text-yellow-500" : "text-black/70 dark:text-white/70"}`}>
                        {formatDuration(elapsed)}
                      </td>
                      <td className="px-3 py-3 text-xs text-black/50 dark:text-white/50 hidden md:table-cell">{getReasonLabel(loan.reason)}</td>
                      <td className="px-3 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadgeClasses(loan.loaned_at, loan.reason, loan.custom_deadline_hours)}`}>
                          {isOverdue ? "Em atraso" : "No prazo"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-sm text-black/30 dark:text-white/30">
                      {search ? "Nenhum resultado encontrado" : "Nenhum empréstimo ativo"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-black/30 dark:text-white/30">
              <span className="text-xs">Mostrando {Math.min(6, filtered.length)} de {filtered.length}</span>
              <a href="/historico" className="text-xs font-medium flex items-center gap-1 transition-colors text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                Ver todos →
              </a>
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="rounded-xl border transition-colors bg-surface-container border-black/5 dark:border-white/5">
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <h2 className="font-semibold text-sm">Alertas</h2>
              {overdue > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/20">
                  {overdue} em atraso
                </span>
              )}
            </div>
            <a href="/alertas" className="text-xs font-medium text-blue-500 dark:text-blue-400">Ver todos</a>
          </div>
          <div className="p-3 space-y-2">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg animate-pulse bg-black/3 dark:bg-white/5" />
              ))
            ) : activeLoans.filter((l) => {
              const elapsed = (Date.now() - new Date(l.loaned_at).getTime()) / 3_600_000;
              return elapsed >= getSlaHours(l.reason, l.custom_deadline_hours) * 0.75;
            }).length === 0 ? (
              <div className="text-center py-8 text-sm text-black/30 dark:text-white/30">
                <svg viewBox="0 0 24 24" className="w-8 h-8 mx-auto mb-2 fill-none stroke-current opacity-30" strokeWidth="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Tudo em dia!
              </div>
            ) : (
              activeLoans
                .filter((l) => {
                  const elapsed = (Date.now() - new Date(l.loaned_at).getTime()) / 3_600_000;
                  return elapsed >= getSlaHours(l.reason, l.custom_deadline_hours) * 0.75;
                })
                .sort((a, b) => {
                  const elA = (Date.now() - new Date(a.loaned_at).getTime()) / 3_600_000;
                  const elB = (Date.now() - new Date(b.loaned_at).getTime()) / 3_600_000;
                  return elB - elA;
                })
                .slice(0, 5)
                .map((loan) => {
                  const elapsed = (Date.now() - new Date(loan.loaned_at).getTime()) / 3_600_000;
                  const sla = getSlaHours(loan.reason, loan.custom_deadline_hours);
                  const isOverdue = elapsed >= sla;
                  return (
                    <div key={loan.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                      isOverdue
                        ? "bg-red-500/10 border-red-500/20"
                        : "bg-yellow-50 border-yellow-100 dark:bg-yellow-500/10 dark:border-yellow-500/20"
                    }`}>
                      <svg viewBox="0 0 24 24" className={`w-4 h-4 flex-shrink-0 mt-0.5 fill-none stroke-current ${isOverdue ? "text-red-500" : "text-yellow-500"}`} strokeWidth="2">
                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{loan.device_name}</p>
                        <p className="text-[10px] truncate text-black/50 dark:text-white/50">
                          com {loan.borrower_name}
                        </p>
                      </div>
                      <span className={`text-xs font-mono font-bold flex-shrink-0 ${isOverdue ? "text-red-500" : "text-yellow-500"}`}>
                        {formatDuration(elapsed)}
                      </span>
                    </div>
                  );
                })
            )}
          </div>
          <div className="px-5 py-3 border-t border-black/5 dark:border-white/5">
            <button className="text-xs flex items-center gap-1.5 transition-colors text-black/40 hover:text-black/60 dark:text-white/40 dark:hover:text-white/60">
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current" strokeWidth="2"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
              Configurar alertas
            </button>
          </div>
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border p-5 transition-colors bg-surface-container border-black/5 dark:border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">iPads mais utilizados</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40">este mês</span>
          </div>
          <div className="space-y-3">
            {loading ? (
              [...Array(5)].map((_, i) => <div key={i} className="h-6 rounded animate-pulse bg-black/3 dark:bg-white/5" />)
            ) : topDevices.length === 0 ? (
              <p className="text-xs text-center py-4 text-black/30 dark:text-white/30">Sem dados este mês</p>
            ) : topDevices.map((d, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs truncate max-w-[160px] opacity-70">{d.device_name}</span>
                </div>
                <MiniBar value={d.count} max={topDevices[0].count} color="bg-blue-500" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-5 transition-colors bg-surface-container border-black/5 dark:border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Usuários mais ativos</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40">este mês</span>
          </div>
          <div className="space-y-3">
            {loading ? (
              [...Array(5)].map((_, i) => <div key={i} className="h-6 rounded animate-pulse bg-black/3 dark:bg-white/5" />)
            ) : topBorrowers.length === 0 ? (
              <p className="text-xs text-center py-4 text-black/30 dark:text-white/30">Sem dados este mês</p>
            ) : topBorrowers.map((p, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs truncate max-w-[160px] opacity-70">{p.borrower_name}</span>
                </div>
                <MiniBar value={p.count} max={topBorrowers[0].count} color="bg-emerald-500" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-5 transition-colors bg-surface-container border-black/5 dark:border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Empréstimos por motivo</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40">este mês</span>
          </div>
          {loading ? (
            <div className="h-24 rounded animate-pulse bg-black/3 dark:bg-white/5" />
          ) : reasonBreakdown.length === 0 ? (
            <p className="text-xs text-center py-8 text-black/30 dark:text-white/30">Sem dados este mês</p>
          ) : (
            <DonutChart data={reasonBreakdown} total={totalMonthLoans} />
          )}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="rounded-xl border transition-colors bg-surface-container border-black/5 dark:border-white/5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
          <h2 className="font-semibold text-sm">Atividades recentes</h2>
          <a href="/historico" className="text-xs font-medium text-blue-500 dark:text-blue-400">Ver histórico completo</a>
        </div>
        <div className="divide-y divide-black/5 dark:divide-white/5">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-7 h-7 rounded-full animate-pulse flex-shrink-0 bg-black/3 dark:bg-white/5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-48 rounded animate-pulse bg-black/3 dark:bg-white/5" />
                  <div className="h-2.5 w-32 rounded animate-pulse bg-black/3 dark:bg-white/5" />
                </div>
              </div>
            ))
          ) : recentActivity.length === 0 ? (
            <div className="text-center py-8 text-sm text-black/30 dark:text-white/30">Nenhuma atividade registrada</div>
          ) : recentActivity.map((act) => {
            const isReturn = !!act.returned_at;
            return (
              <div key={act.loan_id} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-black/[0.01] dark:hover:bg-white/[0.02]">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isReturn ? "bg-blue-50 dark:bg-blue-500/20" : "bg-emerald-50 dark:bg-emerald-500/20"}`}>
                  <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 fill-none stroke-current ${isReturn ? "text-blue-500" : "text-emerald-500"}`} strokeWidth="2.5">
                    <path d={isReturn ? "M7 13l5 5m0 0l5-5m-5 5V6" : "M7 11l5-5m0 0l5 5m-5-5v12"} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium text-black/80 dark:text-white/80">{isReturn ? "Devolução" : "Empréstimo"}</span>
                    <span className="text-black/50 dark:text-white/50"> — {act.device_name} </span>
                    <span className="text-black/50 dark:text-white/50">{isReturn ? "por" : "para"} </span>
                    <span className="font-medium">{act.borrower_name}</span>
                  </p>
                  <p className="text-xs mt-0.5 text-black/30 dark:text-white/30">
                    {formatDate(isReturn ? act.returned_at! : act.loaned_at)}
                  </p>
                </div>
                {act.reason && (
                  <span className="text-xs px-2.5 py-1 rounded-full flex-shrink-0 bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50 hidden sm:inline">
                    {getReasonLabel(act.reason)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}