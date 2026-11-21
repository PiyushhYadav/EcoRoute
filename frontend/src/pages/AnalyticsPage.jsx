import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Building2,
  GitFork,
  Zap,
  TrendingUp,
  PlusCircle,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { api } from '../api/client';

const ALL_CATEGORIES = ['Batteries', 'Computers', 'Smartphones', 'Appliances'];
const CATEGORY_COLORS = {
  Batteries: '#D97706',
  Computers: '#7C3AED',
  Smartphones: '#0284C7',
  Appliances: '#0D9488',
};

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [centres, setCentres] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Centre Form State
  const [newCentreName, setNewCentreName] = useState('');
  const [newCentreLat, setNewCentreLat] = useState(28.5800);
  const [newCentreLng, setNewCentreLng] = useState(77.2000);
  const [newCentreCapacity, setNewCentreCapacity] = useState(30);
  const [newCentreAccepted, setNewCentreAccepted] = useState([...ALL_CATEGORIES]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getOptimization();
      setData(res);
      const cList = res.graph.nodes.filter((n) => n.kind === 'centre');
      setCentres(cList);
    } catch (err) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update Centre Capacity
  const handleCapacityChange = (id, newCap) => {
    setCentres((prev) =>
      prev.map((c) => (c.id === id ? { ...c, max_capacity_kg: parseFloat(newCap) || 0 } : c))
    );
  };

  // Toggle Accepted Category on a centre
  const handleToggleCategory = (centreId, cat) => {
    setCentres((prev) =>
      prev.map((c) => {
        if (c.id !== centreId) return c;
        const current = c.accepted_types || [];
        const next = current.includes(cat)
          ? current.filter((t) => t !== cat)
          : [...current, cat];
        return { ...c, accepted_types: next };
      })
    );
  };

  // Toggle Active/Maintenance Status on a centre
  const handleToggleStatus = async (centre) => {
    const currentActive =
      centre.is_active !== undefined
        ? Boolean(centre.is_active)
        : centre.status !== 'maintenance' && centre.status !== 'offline';
    const nextActive = !currentActive;
    try {
      await api.updateNode(centre.id, { is_active: nextActive });
      await loadData();
    } catch (err) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  // Save Centre Inline Changes
  const handleSaveCentre = async (c) => {
    try {
      await api.updateCentre(c.id, {
        max_capacity_kg: c.max_capacity_kg,
        accepted_types: c.accepted_types,
      });
      alert(`Updated facility '${c.name}' successfully!`);
      await loadData();
    } catch (err) {
      alert(`Failed to update centre: ${err.message}`);
    }
  };

  // Delete Centre
  const handleDeleteCentre = async (id) => {
    if (!window.confirm(`Delete recycling centre ${id}?`)) return;
    try {
      await api.deleteCentre(id);
      await loadData();
    } catch (err) {
      alert(`Failed to delete centre: ${err.message}`);
    }
  };

  // Add New Centre
  const handleAddCentre = async (e) => {
    e.preventDefault();
    if (!newCentreName) return;
    try {
      await api.createCentre({
        name: newCentreName,
        lat: parseFloat(newCentreLat),
        lng: parseFloat(newCentreLng),
        max_capacity_kg: parseFloat(newCentreCapacity),
        accepted_types: newCentreAccepted,
      });
      setNewCentreName('');
      setNewCentreAccepted([...ALL_CATEGORIES]);
      await loadData();
    } catch (err) {
      alert(`Failed to add centre: ${err.message}`);
    }
  };

  if (loading || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 flex items-center justify-center text-slate-500">
        <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mr-2"></div>
        <span>Computing algorithmic benchmarks...</span>
      </div>
    );
  }

  const greedy = data.greedy_summary;
  const optimal = data.optimal_summary;

  // Prepare chart data for Capacity Utilization
  const capacityChartData = centres.map((c) => {
    const allocated = greedy.allocations
      .filter((a) => a.assigned_centre_id === c.id)
      .reduce((sum, a) => sum + a.weight_kg, 0);
    const free = Math.max(0, c.max_capacity_kg - allocated);
    return {
      name: c.name.split(' ')[0], // short name
      fullName: c.name,
      id: c.id,
      Used: allocated,
      Free: free,
      Total: c.max_capacity_kg,
    };
  });

  // Prepare chart data for Waste Volumes by Category
  const categoryVolumeMap = {};
  data.graph.nodes
    .filter((n) => n.kind === 'pickup')
    .forEach((p) => {
      const type = p.waste_type || 'Other';
      categoryVolumeMap[type] = (categoryVolumeMap[type] || 0) + (p.weight_kg || 0);
    });

  const categoryPieData = Object.entries(categoryVolumeMap).map(([type, weight]) => ({
    name: type,
    value: weight,
    color: CATEGORY_COLORS[type] || '#64748B',
  }));

  const totalRegisteredKg = Object.values(categoryVolumeMap).reduce((sum, v) => sum + v, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-slate-800">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
          Algorithmic Benchmarks & Facility Analytics
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1">
          Comparative analysis of Greedy heuristic allocation versus combinatorial Global Optimal branch-and-bound search.
        </p>
      </div>

      {/* Top Section — Greedy vs. Global Optimal Benchmark Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <GitFork className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Greedy Allocation vs. Global Optimal Solver
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Dual-objective metric: (1) Maximize routed kg, (2) Minimize total transport distance
              </p>
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
              data.is_greedy_optimal
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {data.is_greedy_optimal ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Greedy Matched Global Optimal</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Greedy Local Trade-off Observed</span>
              </>
            )}
          </div>
        </div>

        {/* Side-by-Side Comparison Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Greedy Card */}
          <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-sm text-slate-900">Greedy Heuristic</span>
              </div>
              <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                FAST EXECUTION
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Routed</span>
                <span className="font-mono font-extrabold text-base text-slate-900">
                  {greedy.total_routed_kg} <span className="text-xs font-normal">kg</span>
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Distance</span>
                <span className="font-mono font-extrabold text-base text-slate-900">
                  {greedy.total_distance_km} <span className="text-xs font-normal">km</span>
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Runtime</span>
                <span className="font-mono font-extrabold text-base text-emerald-700">
                  {greedy.execution_time_ms} <span className="text-xs font-normal">ms</span>
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Greedy sorts candidate facilities by Dijkstra shortest distance and assigns to the first compliant centre. Suitable for live dispatch across thousands of nodes.
            </p>
          </div>

          {/* Optimal Card */}
          <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitFork className="w-4 h-4 text-violet-600" />
                <span className="font-bold text-sm text-slate-900">Branch-and-Bound DFS</span>
              </div>
              <span className="text-[10px] font-mono bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full font-bold">
                MATHEMATICAL OPTIMUM
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Routed</span>
                <span className="font-mono font-extrabold text-base text-slate-900">
                  {optimal.total_routed_kg} <span className="text-xs font-normal">kg</span>
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Distance</span>
                <span className="font-mono font-extrabold text-base text-slate-900">
                  {optimal.total_distance_km} <span className="text-xs font-normal">km</span>
                </span>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Runtime</span>
                <span className="font-mono font-extrabold text-base text-violet-700">
                  {optimal.execution_time_ms} <span className="text-xs font-normal">ms</span>
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Explores assignment branches exhaustively with capacity pruning, verifying whether local greedy choices sacrifice total system throughput.
            </p>
          </div>
        </div>

        {/* Comparative Notes Banner */}
        <div className="px-6 py-3 bg-slate-100/60 border-t border-slate-200 text-xs text-slate-700 font-medium">
          💡 <strong>Benchmark Insight:</strong> {data.comparison_notes}
        </div>
      </div>

      {/* Charts Row (Recharts) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Facility Capacity Utilization Bar Chart (7 cols on lg) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Facility Capacity Utilization (kg)</h3>
              <p className="text-xs text-slate-500">Allocated load vs remaining processing headroom</p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={capacityChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip
                  formatter={(value, name, item) => {
                    const payload = item?.payload || {};
                    const total = payload.Total || 0;
                    const pct = total > 0 ? Math.round((payload.Used / total) * 100) : 0;
                    if (name === 'Used') {
                      return [`${payload.Used} / ${total} kg (${pct}%)`, 'Capacity Used'];
                    }
                    return [`${value} kg`, name];
                  }}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    fontSize: '11px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  formatter={(value) => <span className="text-slate-600 text-xs font-medium">{value}</span>}
                />
                <Bar dataKey="Used" stackId="a" radius={[0, 0, 4, 4]}>
                  {capacityChartData.map((entry, index) => {
                    const pct = entry.Total > 0 ? (entry.Used / entry.Total) * 100 : 0;
                    const color = pct >= 99.9 ? '#EF4444' : pct >= 85 ? '#F59E0B' : '#10B981';
                    return <Cell key={`used-cell-${index}`} fill={color} />;
                  })}
                </Bar>
                <Bar dataKey="Free" stackId="a" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* E-Waste Volume by Stream Donut Chart (5 cols on lg) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900">E-Waste Consignments by Category</h3>
            <p className="text-xs text-slate-500">Net kilograms registered across all active pickups</p>
          </div>

          <div className="h-64 w-full flex items-center justify-center relative">
            {/* Centered Total Readout inside Donut Hole */}
            <div className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none text-center">
              <span className="text-xl font-mono font-extrabold text-slate-900 leading-tight">
                {totalRegisteredKg} <span className="text-xs font-sans font-medium text-slate-500">kg</span>
              </span>
              <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                Total Registered
              </span>
            </div>

            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryPieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {categoryPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `${value} kg`}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    fontSize: '11px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={(value) => {
                    const item = categoryPieData.find((d) => d.name === value);
                    return (
                      <span className="text-slate-700 text-xs font-medium">
                        {value} <span className="text-slate-400 font-mono font-normal">({item ? `${item.value} kg` : '0 kg'})</span>
                      </span>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recycling Centres Management Table & Quick Add Form */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden space-y-6 p-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Recycling Centres Management</h2>
          <p className="text-xs text-slate-500">
            Adjust facility capacities, toggle category certifications, and switch operational status in real time. Changes persist to SQLite.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Centre ID</th>
                <th className="py-2.5 px-3">Facility Name</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Coordinates</th>
                <th className="py-2.5 px-3">Max Capacity (kg)</th>
                <th className="py-2.5 px-3">Accepted Categories</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {centres.map((c) => {
                const isActive =
                  c.is_active !== undefined
                    ? Boolean(c.is_active)
                    : c.status !== 'maintenance' && c.status !== 'offline';
                return (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">{c.id}</td>
                    <td className="py-3 px-3 font-semibold text-slate-800">{c.name}</td>
                    <td className="py-3 px-3">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(c)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors flex items-center gap-1.5 shadow-2xs ${
                          isActive
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                        }`}
                        title="Click to toggle Active / Maintenance status"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActive ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                        />
                        <span>{isActive ? 'Active' : 'Maintenance'}</span>
                      </button>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                      {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                    </td>
                    <td className="py-3 px-3">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={c.max_capacity_kg}
                        onChange={(e) => handleCapacityChange(c.id, e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-200 rounded font-mono text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-900"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_CATEGORIES.map((cat) => {
                          const isAccepted = (c.accepted_types || []).includes(cat);
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => handleToggleCategory(c.id, cat)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${
                                isAccepted
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                  : 'bg-slate-100 border-slate-200 text-slate-400 line-through opacity-60'
                              }`}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSaveCentre(c)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                          title="Save Changes"
                        >
                          <Save className="w-3 h-3" />
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCentre(c.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                          title="Delete Centre"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Quick Add Centre Form */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <span className="text-xs font-bold text-slate-800 block">
            + Register New Recycling Facility
          </span>
          <form onSubmit={handleAddCentre} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <div className="sm:col-span-2">
                <label className="text-slate-500 font-medium block mb-1">Facility Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rohini Circular Recyclers"
                  value={newCentreName}
                  onChange={(e) => setNewCentreName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-medium block mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={newCentreLat}
                  onChange={(e) => setNewCentreLat(parseFloat(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-medium block mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={newCentreLng}
                  onChange={(e) => setNewCentreLng(parseFloat(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="text-slate-500 font-medium block mb-1">Capacity (kg)</label>
                <input
                  type="number"
                  min="5"
                  step="5"
                  required
                  value={newCentreCapacity}
                  onChange={(e) => setNewCentreCapacity(parseFloat(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg font-mono text-slate-800"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-1 shadow-xs"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add Centre
                </button>
              </div>
            </div>

            {/* Clickable Accepted Categories Toggle Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <span className="text-slate-500 font-medium">Accepted Streams:</span>
              <div className="flex flex-wrap gap-1.5">
                {ALL_CATEGORIES.map((cat) => {
                  const isAccepted = newCentreAccepted.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setNewCentreAccepted((prev) =>
                          prev.includes(cat)
                            ? prev.length > 1 ? prev.filter((t) => t !== cat) : prev
                            : [...prev, cat]
                        );
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        isAccepted
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-2xs font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-400 line-through opacity-60'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
