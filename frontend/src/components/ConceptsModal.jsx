import React, { useRef, useEffect, useState } from 'react';
import { X, BookOpen, Cpu, Route, GitFork, ShieldCheck, Zap, Layers } from 'lucide-react';

export default function ConceptsModal({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  const [activeTab, setActiveTab] = useState('dijkstra');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Handle escape or click backdrop
  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={onClose}
      aria-labelledby="concepts-modal-title"
      className="fixed inset-0 m-auto p-0 max-w-4xl w-[95vw] max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800 overflow-hidden z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 id="concepts-modal-title" className="text-lg font-bold text-slate-900 tracking-tight">
              Key Concepts & Should-Know Notes
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Architectural, algorithmic, and computational logistics reference guide
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50/40 px-6 gap-2 pt-2">
        <button
          onClick={() => setActiveTab('dijkstra')}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'dijkstra'
              ? 'border-emerald-600 text-emerald-800 bg-white shadow-sm'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Route className="w-3.5 h-3.5" />
          Dijkstra's Algorithm
        </button>
        <button
          onClick={() => setActiveTab('greedy')}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'greedy'
              ? 'border-emerald-600 text-emerald-800 bg-white shadow-sm'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Greedy Allocation
        </button>
        <button
          onClick={() => setActiveTab('optimal')}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'optimal'
              ? 'border-emerald-600 text-emerald-800 bg-white shadow-sm'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <GitFork className="w-3.5 h-3.5" />
          Global Optimal Benchmark
        </button>
        <button
          onClick={() => setActiveTab('logistics')}
          className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'logistics'
              ? 'border-emerald-600 text-emerald-800 bg-white shadow-sm'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          E-Waste Domain Rules
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-600">
        {activeTab === 'dijkstra' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-2">
                <Route className="w-4 h-4 text-emerald-600" />
                Dijkstra's Shortest Path Formulation
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Dijkstra's algorithm computes the single-source shortest path tree on a weighted graph with non-negative edge weights.
                In EcoRoute, the graph represents real urban road networks where nodes are pickup points, transit intersections, and recycling centres.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block mb-1">Time & Space Complexity</span>
                <p className="text-xs font-mono text-emerald-700 font-semibold mb-1">O((V + E) log V) Time | O(V + E) Space</p>
                <p className="text-xs text-slate-600">
                  Using Python's <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">heapq</code> binary min-heap, vertex extraction is <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">O(log V)</code> and edge relaxations occur across all <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">E</code> edges.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block mb-1">Dynamic Effective Weight</span>
                <p className="text-xs font-mono text-emerald-700 font-semibold mb-1">w'(e) = base_km × traffic_mult</p>
                <p className="text-xs text-slate-600">
                  Edge weights adapt in real-time to traffic conditions (e.g. 2.5× during peak hours) and infinite weight (omission) during roadblocks.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 text-amber-900 text-xs leading-relaxed">
              <strong>Why Non-Negative Weights Matter:</strong> Dijkstra's greedy choice property assumes that once a vertex is extracted from the min-heap, its shortest distance is finalized. Negative weights would invalidate this invariant, requiring Bellman-Ford <code className="bg-amber-100 px-1 py-0.5 rounded">O(V · E)</code> instead. In physical transit networks, road distances and travel times are strictly positive.
            </div>
          </div>
        )}

        {activeTab === 'greedy' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-emerald-600" />
                Greedy Capacity-Constrained Allocation Heuristic
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                EcoRoute solves the multi-facility assignment problem where each e-waste pickup must be transported to a certified recycling centre that accepts its material category and possesses sufficient remaining processing capacity.
              </p>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100/70 px-4 py-2 text-xs font-bold text-slate-700 border-b border-slate-200">
                3-Step Candidate Verification Checklist
              </div>
              <div className="p-4 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">1</span>
                  <div>
                    <span className="font-semibold text-slate-800">Reachable Network Path:</span> Dijkstra shortest distance from pickup to centre must be &lt; ∞ (graph connected and no total blockage).
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">2</span>
                  <div>
                    <span className="font-semibold text-slate-800">Waste Category Certification:</span> Target centre's <code className="bg-slate-100 px-1 py-0.5 rounded">accepted_types</code> list must include pickup's category (e.g. Batteries, Computers).
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">3</span>
                  <div>
                    <span className="font-semibold text-slate-800">Residual Capacity Constraint:</span> Target centre's <code className="bg-slate-100 px-1 py-0.5 rounded">remaining_capacity_kg ≥ pickup.weight_kg</code>.
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-white text-xs">
              <span className="font-bold text-slate-800 block mb-1">Ordering Strategies Impact:</span>
              <p className="text-slate-600 mb-2">
                <strong>Default Order:</strong> Processes requests in receipt order (FIFO / node index). Simple and fair to donors, but early small requests can consume specialized capacity.
              </p>
              <p className="text-slate-600">
                <strong>Heaviest-First Order:</strong> Sorts requests descending by weight. Similar to the First-Fit-Decreasing heuristic in the Bin Packing Problem, this frequently achieves higher total routed volume.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'optimal' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-2">
                <GitFork className="w-4 h-4 text-emerald-600" />
                Branch-and-Bound Global Optimal Benchmark
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Capacity-constrained facility assignment is a generalization of the Generalized Assignment Problem (GAP), which is NP-hard. EcoRoute includes an exact combinatorial branch-and-bound solver to provide an empirical ground-truth benchmark.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                <span className="font-bold text-slate-900 block mb-1">Greedy Heuristic</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>Time complexity: <span className="font-mono text-emerald-700 font-semibold">O(P · (V + E) log V + P · C log C)</span></li>
                  <li>Runtime: ~0.1 – 0.5 ms</li>
                  <li>Scalability: Scales to thousands of pickups</li>
                  <li>Solution quality: Highly competitive, occasionally trapped in local optima</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-lg border border-slate-200 bg-white">
                <span className="font-bold text-slate-900 block mb-1">Branch-and-Bound DFS</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>Time complexity: <span className="font-mono text-violet-700 font-semibold">O(C^P)</span> worst case</li>
                  <li>Runtime: ~1 – 15 ms for small networks</li>
                  <li>Scalability: Exponential growth, safe cap at ~10 pickups</li>
                  <li>Solution quality: Guaranteed mathematically global optimum</li>
                </ul>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-950">
              <strong>Objective Priority Function:</strong>
              <div className="mt-1 font-mono text-[11px] bg-white/80 p-2 rounded border border-emerald-300">
                1. Maximize Total Routed Weight (kg)<br />
                2. Minimize Total Transport Distance (km)
              </div>
              <p className="mt-1.5 text-slate-600">
                This dual-objective formulation ensures maximum environmental e-waste recovery while minimizing transportation carbon footprint.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'logistics' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Civic E-Waste Logistics & Environmental Impact
              </h3>
              <p className="text-xs leading-relaxed text-slate-600">
                Electronic waste contains toxic heavy metals (lead, mercury, cadmium) as well as precious recoverable elements (gold, copper, lithium). Improper disposal pollutes soil and groundwater.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/40">
                <span className="font-bold text-amber-900 block">Batteries (Amber)</span>
                <span className="text-slate-600 text-[11px]">Lithium-ion & lead-acid; requires fire-suppression transport & specialized acid treatment.</span>
              </div>
              <div className="p-3 rounded-lg border border-violet-200 bg-violet-50/40">
                <span className="font-bold text-violet-900 block">Computers (Violet)</span>
                <span className="text-slate-600 text-[11px]">PCBs, GPUs, servers; shredding & gold/palladium hydrometallurgical extraction.</span>
              </div>
              <div className="p-3 rounded-lg border border-sky-200 bg-sky-50/40">
                <span className="font-bold text-sky-900 block">Smartphones (Sky)</span>
                <span className="text-slate-600 text-[11px]">Compact cobalt batteries, rare earth magnets & display glass recovery.</span>
              </div>
              <div className="p-3 rounded-lg border border-teal-200 bg-teal-50/40">
                <span className="font-bold text-teal-900 block">Appliances (Teal)</span>
                <span className="text-slate-600 text-[11px]">White goods (refrigerators, ACs); CFC extraction and heavy steel/copper recycling.</span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-slate-200 bg-white text-xs">
              <span className="font-bold text-slate-900 block mb-1">CO₂ Abatement Formula</span>
              <p className="font-mono text-emerald-700 font-semibold mb-1">CO₂e_saved (kg) = Routed_E-Waste (kg) × 1.44</p>
              <p className="text-slate-600">
                Based on global life-cycle assessment (LCA) averages, every 1 kg of certified recycled e-waste avoids approximately 1.44 kg of CO₂ equivalent emissions compared to primary mineral extraction and open landfilling.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
        >
          Close Reference
        </button>
      </div>
    </dialog>
  );
}
