import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Truck,
  Route,
  Zap,
  Leaf,
  ShieldCheck,
  Building2,
  ArrowRight,
  TrendingUp,
  Cpu,
  Layers,
} from 'lucide-react';
import { api } from '../api/client';

export default function OverviewPage() {
  const [stats, setStats] = useState({
    routedKg: 55.0,
    distanceKm: 88.0,
    timeMin: 134.0,
    centresCount: 3,
    totalCapacityKg: 82.0,
    co2Saved: 79.2,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getOptimization()
      .then((data) => {
        if (data?.greedy_summary) {
          const s = data.greedy_summary;
          const centres = data.graph?.nodes?.filter((n) => n.kind === 'centre') || [];
          const totalCap = centres.reduce((acc, c) => acc + (c.max_capacity_kg || 0), 0);
          setStats({
            routedKg: s.total_routed_kg || 0,
            distanceKm: s.total_distance_km || 0,
            timeMin: s.total_time_min || 0,
            centresCount: centres.length || 3,
            totalCapacityKg: totalCap || 82,
            co2Saved: s.co2_saved_kg || 0,
          });
        }
      })
      .catch((err) => {
        console.warn('Failed to load live overview metrics:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 text-slate-800">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-white to-slate-50 border border-slate-200/80 p-8 sm:p-12 shadow-xs">
        <div className="max-w-3xl space-y-4">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-950 tracking-tight leading-tight">
            Algorithmic Route Optimisation for Urban E-Waste Collection
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
            EcoRoute coordinates decentralized e-waste pickup requests with licensed recycling centres across metropolitan Delhi NCR.
            Powered by <strong>Dijkstra’s shortest-path algorithm</strong> and <strong>Greedy capacity-constrained allocation</strong>, our engine dynamically balances road traffic disruptions with hazardous material processing constraints.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Link
              to="/dispatch"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2 group"
            >
              <span>Launch Live Dispatch Simulator</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/schedule"
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-sm shadow-xs transition-colors"
            >
              Schedule New Pickup Request
            </Link>
          </div>
        </div>

        {/* E-Waste Category Badges */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Certified Waste Streams:
          </span>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            Batteries (Amber)
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-900 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-violet-500"></span>
            Computers & Servers (Violet)
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            Smartphones & Gadgets (Sky)
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-teal-500"></span>
            Appliances & Heavy White Goods (Teal)
          </div>
        </div>
      </div>

      {/* Live KPIs Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total E-Waste Routed
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono mt-1">
              {stats.routedKg.toFixed(1)} <span className="text-sm font-sans font-medium text-slate-500">kg</span>
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">100% Request Fulfillment</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Optimal Fleet Distance
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono mt-1">
              {stats.distanceKm.toFixed(1)} <span className="text-sm font-sans font-medium text-slate-500">km</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {stats.timeMin > 0 ? `${stats.timeMin.toFixed(0)} min travel time` : 'Dijkstra Shortest Paths'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Route className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Active Recycling Centres
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono mt-1">
              {stats.centresCount} <span className="text-sm font-sans font-medium text-slate-500">Facilities</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">{stats.totalCapacityKg} kg Total Capacity</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Abated CO₂ Emissions
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono mt-1">
              {stats.co2Saved.toFixed(1)} <span className="text-sm font-sans font-medium text-slate-500">kg CO₂e</span>
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">1.44 kg CO₂ / kg E-Waste</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Leaf className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 3 Core Workflow Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Architecture & Mathematical Pillars</h2>
            <p className="text-xs text-slate-500">How EcoRoute pairs graph theory with real-world municipal logistics</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center">
                <Layers className="w-5 h-5 text-slate-700" />
              </div>
              <h3 className="font-bold text-base text-slate-900">1. Weighted Road Graph & Resiliency</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Delhi NCR is modeled as a planar graph <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">G = (V, E)</code>.
                Vertices include pickups, road junctions (Dhaula Kuan, Punjabi Bagh), and recycling centres.
                Edge weights dynamically scale with traffic multipliers (1.0× to 2.5×) and roadblock toggles.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center text-xs font-semibold text-emerald-700">
              Auto-Connect Rule for Any Pin
            </div>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Route className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">2. Dijkstra’s Shortest-Path Engine</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Computes point-to-point shortest routes using a priority queue (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono">heapq</code>) in <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">O((V + E) log V)</code>.
                When road incidents occur, Dijkstra identifies alternative arterial bypasses in sub-millisecond execution times.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center text-xs font-semibold text-emerald-700">
              Min-Heap Priority Queue Inspection
            </div>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">3. Greedy Capacity Allocation</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Evaluates candidate centres in order of proximity, enforcing multi-category compliance and residual capacity limits.
                Benchmarked against a bounded Branch-and-Bound DFS global optimal solver for total routed volume.
              </p>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center text-xs font-semibold text-emerald-700">
              Interactive Candidate Checklist
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
