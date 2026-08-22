import { useState } from "react";
import { 
  DoorOpen, Users, Clock, CalendarDays, Search,
  ArrowRight, ShieldAlert, CheckCircle2, SearchX, Briefcase, BookOpen, BarChart3, TriangleAlert, CircleAlert, Lightbulb
} from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { QueryState, AnalyticsTable } from "@/shared/components/analytics";
import usePermissions from "@/shared/hooks/usePermissions";
import { PERMISSIONS } from "@/shared/constants/permissions";

const getTodayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
import { useRoomRevenue } from "@/owner/features/financeAnalytics/hooks/useFinanceAnalytics";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, PieChart, Pie, Cell, BarChart, Bar, Legend } from "recharts";
import Button from "@/shared/components/ui/button/Button";
import Input from "@/shared/components/ui/input/Input";
import SelectField from "@/shared/components/ui/select/SelectField";

import { useRoomDashboardQuery, useRoomFinderQuery, useRoomScheduleQuery } from "../hooks/useRoomAnalytics";
import RoomDateFilter from "./RoomDateFilter";
import RoomDetailsPanel from "./RoomDetailsPanel";

const SEVERITY = {
  high: { icon: TriangleAlert, cls: "text-destructive" },
  medium: { icon: CircleAlert, cls: "text-warning" },
  low: { icon: Lightbulb, cls: "text-muted-foreground" },
};

const DAY_LABEL = {
  mon: "Dush", tue: "Sesh", wed: "Chor", thu: "Pay",
  fri: "Jum", sat: "Shan", sun: "Yak",
};

const MetricCard = ({ title, value, subtitle, icon: Icon, colorCls }) => (
  <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
    <div className="flex items-center justify-between mb-4">
      <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
      <div className={cn("p-2 rounded-lg bg-muted", colorCls)}>
        <Icon className="size-4" />
      </div>
    </div>
    <div>
      <div className="text-2xl font-bold text-foreground">{value ?? "—"}</div>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  </div>
);

const UtilizationBar = ({ value }) => {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="tabular-nums">{value}%</span>
      <span className="hidden h-2 w-20 overflow-hidden rounded-full bg-muted sm:inline-block">
        <span
          className={cn(
            "block h-full rounded-full transition-all duration-500",
            value >= 75 ? "bg-destructive" : value <= 25 ? "bg-muted-foreground/40" : "bg-primary",
          )}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </span>
    </span>
  );
};

const WEEK_DAYS = [
  { value: "mon", label: "Dush" },
  { value: "tue", label: "Sesh" },
  { value: "wed", label: "Chor" },
  { value: "thu", label: "Pay" },
  { value: "fri", label: "Jum" },
  { value: "sat", label: "Shan" },
  { value: "sun", label: "Yak" },
];

const TIME_OPTIONS = Array.from({ length: 15 * 2 - 1 }).map((_, i) => {
  const h = Math.floor(i / 2) + 8;
  const m = i % 2 === 0 ? '00' : '30';
  const time = `${String(h).padStart(2, '0')}:${m}`;
  return { value: time, label: time };
});

const RoomFinderForm = ({ onSearch, isSearching }) => {
  const [days, setDays] = useState(["mon", "wed", "fri"]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [capacity, setCapacity] = useState("");

  const toggleDay = (day) => {
    setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (days.length > 0) {
      onSearch({ 
        days, 
        startTime: startTime || undefined, 
        endTime: endTime || undefined, 
        capacity: capacity ? Number(capacity) : undefined 
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-muted/30 p-4 rounded-xl border border-border">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Hafta kunlari</label>
        <div className="flex flex-wrap gap-2">
          {WEEK_DAYS.map(d => (
            <button 
              key={d.value} 
              type="button"
              onClick={() => toggleDay(d.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                days.includes(d.value) 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-card text-foreground border-border hover:bg-muted"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Boshlanish vaqti</label>
          <SelectField value={startTime} onChange={setStartTime} options={[{value: "", label: "Tanlang"}, ...TIME_OPTIONS]} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Tugash vaqti</label>
          <SelectField value={endTime} onChange={setEndTime} options={[{value: "", label: "Tanlang"}, ...TIME_OPTIONS]} />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Sig'im (min. kishi)</label>
          <Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="0" min="1" />
        </div>
        <div>
          <Button type="submit" className="w-full" disabled={isSearching || days.length === 0}>
            <Search className="size-4 mr-2" /> Izlash
          </Button>
        </div>
      </div>
    </form>
  );
};

const RoomUtilizationSection = ({ branchId, enabled = true }) => {
  const [dateRange, setDateRange] = useState({});
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  const params = branchId ? { branchId, ...dateRange } : { ...dateRange };
  const dashboardQuery = useRoomDashboardQuery(params, { enabled });
  
  const [finderParams, setFinderParams] = useState({ days: ["mon", "wed", "fri"] });
  const finderQuery = useRoomFinderQuery({ ...params, ...finderParams }, { enabled: enabled });

  const scheduleQuery = useRoomScheduleQuery(params, { enabled });

  const { has } = usePermissions();
  const canRevenue = has(PERMISSIONS.FINANCE_VIEW_PROFITABILITY);
  const revenueQuery = useRoomRevenue(params, { enabled: enabled && canRevenue });

  return (
    <section className="space-y-6">
      <div className="flex justify-end">
        <RoomDateFilter onChange={setDateRange} />
      </div>
      <QueryState
        query={dashboardQuery}
        empty={!dashboardQuery.data?.kpi?.totalRooms}
        emptyTitle="Xona yo'q"
        emptyHint="Bandlik hisobi uchun avval xona qo'shilishi kerak."
      >
        {(data) => (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* KPI CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <MetricCard title="Jami xonalar" value={data.kpi.totalRooms} icon={DoorOpen} colorCls="text-blue-500 bg-blue-500/10" />
              <MetricCard title="Bugun band" value={data.kpi.occupiedToday} icon={Users} colorCls="text-green-500 bg-green-500/10" />
              <MetricCard title="Bugun bo'sh" value={data.kpi.emptyToday} icon={CheckCircle2} colorCls="text-orange-500 bg-orange-500/10" />
              <MetricCard title="Bugungi jami dars" value={data.kpi.todayLessons} icon={BookOpen} colorCls="text-purple-500 bg-purple-500/10" />
              <MetricCard title="O'rtacha bandlik" value={`${data.kpi.averageOccupancy ?? 0}%`} icon={BarChart3} colorCls="text-indigo-500 bg-indigo-500/10" />
              <MetricCard title="Eng ko'p band" value={data.kpi.busiestRoom?.name} subtitle={`${data.kpi.busiestRoom?.occupancy}% bandlik`} icon={TriangleAlert} colorCls="text-destructive bg-destructive/10" />
              <MetricCard title="Eng ko'p bo'sh" value={data.kpi.leastOccupiedRoom?.name} subtitle={`${data.kpi.leastOccupiedRoom?.occupancy}% bandlik`} icon={Lightbulb} colorCls="text-muted-foreground bg-muted" />
            </div>

            {/* CHARTS ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold mb-6">Xonalar bo'yicha bandlik</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.ranking.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                      <RechartsTooltip cursor={{ fill: "hsl(var(--muted)/0.4)" }} contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }} />
                      <Bar dataKey="utilizationPercent" radius={[0, 4, 4, 0]} name="Bandlik %">
                        {data.ranking.slice(0,10).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.utilizationPercent >= 75 ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold mb-6">Haftalik xona bandligi grafigi</h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorOcc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(val) => DAY_LABEL[val] || val} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(val) => `${val}%`} />
                      <RechartsTooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }} />
                      <Area type="monotone" dataKey="occupancyRate" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorOcc)" name="Bandlik %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* DISTRIBUTION & FINDER ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center">
                <h3 className="text-base font-semibold mb-4 self-start">Xonalar holati</h3>
                <div className="h-[200px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="count"
                        stroke="none"
                      >
                        {data.statusDistribution.map((entry, index) => {
                          const colors = {
                            "Band": "hsl(var(--primary))",
                            "Bo'sh": "hsl(var(--warning))",
                            "Ta'mirda": "hsl(var(--destructive))",
                            "Nofaol": "hsl(var(--muted-foreground))"
                          };
                          return <Cell key={`cell-${index}`} fill={colors[entry.status]} />;
                        })}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-4 mt-4 w-full">
                  {data.statusDistribution.map(s => (
                    <div key={s.status} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className={cn("size-3 rounded-full", s.color)}></span>
                      {s.status}: {s.count}
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 flex flex-col">
                <h3 className="text-base font-semibold mb-4">Bo'sh xona topish</h3>
                <RoomFinderForm onSearch={setFinderParams} isSearching={finderQuery.isFetching} />
                <div className="mt-4 flex-1">
                  <QueryState query={finderQuery} loadingRows={3}>
                    {(finderData) => (
                      <AnalyticsTable 
                        rows={finderData}
                        rowKey={(r) => r.roomId}
                        onRowClick={(r) => setSelectedRoomId(r.roomId)}
                        columns={[
                          { key: "name", label: "Xona" },
                          ...(branchId ? [] : [{ key: "branchName", label: "Filial" }]),
                          { key: "capacity", label: "Sig'im", align: "right" },
                          { 
                            key: "status", 
                            label: "Holati",
                            render: (r) => (
                              <span className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                r.isFree ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                              )}>
                                {r.status}
                              </span>
                            )
                          },
                          { 
                            key: "freeWindows", 
                            label: "Bo'sh oynalar", 
                            render: (r) => (
                              <div className="flex flex-wrap gap-1">
                                {r.freeWindows.length > 0 ? r.freeWindows.map((w,i) => (
                                  <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-xs">{w.from}-{w.to}</span>
                                )) : <span className="text-muted-foreground text-xs">—</span>}
                              </div>
                            )
                          }
                        ]}
                      />
                    )}
                  </QueryState>
                </div>
              </div>
            </div>

            {/* RECOMMENDATIONS & CONFLICTS */}
            {data.baseUtilization.recommendations?.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-base font-semibold mb-4">Tizim tavsiyalari va xatolar</h3>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.baseUtilization.recommendations.slice(0, 8).map((rec, i) => {
                    const s = SEVERITY[rec.severity] || SEVERITY.low;
                    return (
                      <li key={rec.id || `${rec.kind}-${i}`} className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
                        <s.icon className={cn("mt-0.5 size-5 shrink-0", s.cls)} />
                        <span className="text-sm text-foreground">{rec.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* MOST UNUSED ROOMS & FULL LIST */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold">Barcha xonalar tahlili</h3>
              <AnalyticsTable
                rows={data.ranking}
                rowKey={(r) => r.roomId}
                onRowClick={(r) => setSelectedRoomId(r.roomId)}
                defaultSort={{ key: "utilizationPercent", dir: "desc" }}
                columns={[
                  { key: "name", label: "Xona" },
                  ...(branchId ? [] : [{ key: "branchName", label: "Filial" }]),
                  { key: "groupCount", label: "Guruhlar", align: "right", kind: "number" },
                  { key: "busyHours", label: "Band soat", align: "right", kind: "number" },
                  { key: "freeHours", label: "Bo'sh soat", align: "right", kind: "number" },
                  {
                    key: "utilizationPercent",
                    label: "Bandlik",
                    align: "right",
                    render: (r) => <UtilizationBar value={r.utilizationPercent} />,
                  },
                ]}
              />
            </div>

            {/* ROOM SCHEDULE GRID */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-base font-semibold">Xona jadvali (Haftalik)</h3>
              <QueryState query={scheduleQuery} loadingRows={5}>
                {(scheduleData) => (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="border-b border-border p-3 text-left font-medium text-muted-foreground w-40">Xona</th>
                          {scheduleData.map(d => (
                            <th key={d.date} className="border-b border-border p-3 text-left font-medium text-muted-foreground">
                              {DAY_LABEL[d.day]} <br/><span className="text-xs font-normal">{d.date.substring(5)}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleData[0]?.rooms?.map((room, idx) => (
                          <tr key={room.roomId} className="border-b border-border hover:bg-muted/30">
                            <td className="p-3 font-medium align-top">
                              {room.roomName}
                              {!branchId && <div className="text-xs text-muted-foreground font-normal">{room.branchName}</div>}
                            </td>
                            {scheduleData.map(dayData => {
                              const dayRoom = dayData.rooms.find(r => r.roomId === room.roomId);
                              return (
                                <td key={`${dayData.date}-${room.roomId}`} className="p-2 align-top">
                                  <div className="flex flex-col gap-2">
                                    {dayRoom?.lessons?.map((l, i) => (
                                      <div key={i} className={cn(
                                        "p-2 rounded-md border border-border text-xs",
                                        l.isCanceled ? "bg-muted opacity-50" : "bg-primary/5"
                                      )}>
                                        <div className="font-semibold text-primary">{l.startTime} - {l.endTime}</div>
                                        <div className="font-medium truncate" title={l.groupName}>{l.groupName}</div>
                                        <div className="text-muted-foreground truncate">{l.subjectName}</div>
                                      </div>
                                    ))}
                                    {(!dayRoom?.lessons || dayRoom.lessons.length === 0) && (
                                      <span className="text-xs text-muted-foreground/50 p-2 block text-center">—</span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </QueryState>
            </div>
            
          </div>
        )}
      </QueryState>

      <RoomDetailsPanel 
        roomId={selectedRoomId} 
        branchId={branchId}
        from={dateRange.from}
        to={dateRange.to}
        open={!!selectedRoomId} 
        onClose={() => setSelectedRoomId(null)} 
      />
    </section>
  );
};

export default RoomUtilizationSection;
