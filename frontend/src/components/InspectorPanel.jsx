import React, { useState, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  ListOrdered,
  Square,
} from 'lucide-react';

export const CATEGORY_COLORS = {
  Batteries: '#EA580C',
  Computers: '#7C3AED',
  Smartphones: '#0284C7',
  Appliances: '#0D9488',
};

export function formatCost(val, unit = '') {
  if (val == null || !Number.isFinite(Number(val)) || Number(val) >= 9000) {
    return '∞';
  }
  const num = Number(val);
  const rounded = Math.round(num * 10) / 10;
  const formatted = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  return unit ? `${formatted} ${unit}` : formatted;
}

const PSEUDOCODE_LINES = [
  { line: 1, text: '1. Set dist[source] = 0, others = ∞; push (0, source) to Min-Heap' },
  { line: 2, text: '2. Pop node u with minimum dist[u] from Min-Heap' },
  { line: 3, text: '3. For each open neighbor v: if dist[u] + w(u,v) < dist[v] → relax dist[v]' },
  { line: 4, text: '4. Mark u visited; repeat until all reachable centres settled' },
  { line: 5, text: '5. Greedy: pick nearest centre with matching category & free capacity' },
];

export default function InspectorPanel({
  pickupWalkthroughs = [],
  selectedPickupId = 'P1',
  currentStepIndex = 0,
  isPlaying = false,
  isRunAll = false,
  currentRunAllIndex = 0,
  playbackSpeed = 1,
  dispatchOrder = 'default',
  metric = 'time',
  distanceMatrix = {},
  nodes = [],
  edges = [],
  greedySummary = null,
  optimalSummary = null,
  rerouteNotice = null,
  onSelectPickupTab = () => {},
  onPlayPause = () => {},
  onRunAll = () => {},
  onStopAll = () => {},
  onPrevStep = () => {},
  onNextStep = () => {},
  onResetStep = () => {},
  onSetStep = () => {},
  onSetSpeed = () => {},
  onSetDispatchOrder = () => {},
  onSetMetric = () => {},
  onApplyDisruptionPreset = () => {},
  onPreviewPath = () => {},
}) {
  // Pickups and Centres lists
  const pickups = useMemo(() => nodes.filter((n) => n.kind === 'pickup'), [nodes]);
  const centres = useMemo(() => nodes.filter((n) => n.kind === 'centre'), [nodes]);

  const totalPickups = pickupWalkthroughs.length || pickups.length || 4;

  // Current active walkthrough & node
  const currentWalkthrough = useMemo(() => {
    return pickupWalkthroughs.find((w) => w.pickup_id === selectedPickupId) || pickupWalkthroughs[0] || null;
  }, [pickupWalkthroughs, selectedPickupId]);

  const activePickupNode = useMemo(() => {
    return pickups.find((p) => p.id === selectedPickupId) || null;
  }, [pickups, selectedPickupId]);

  const activeAllocation = useMemo(() => {
    return greedySummary?.allocations?.find((a) => a.pickup_id === selectedPickupId) || null;
  }, [greedySummary, selectedPickupId]);

  const steps = currentWalkthrough?.steps || [];
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex] || steps[0] || {};

  // Active executing pseudocode line (1..5)
  const activeCodeLine = useMemo(() => {
    if (selectedPickupId === 'ALL') return null;
    if (currentStep.pseudocode_line) return currentStep.pseudocode_line;
    if (currentStep.event_type === 'dijkstra_init') return 1;
    if (currentStep.event_type === 'dijkstra_pop') return 2;
    if (currentStep.event_type === 'dijkstra_relax') return 3;
    if (currentStep.event_type === 'greedy_eval' || currentStep.event_type === 'route_confirm') return 5;
    return 1;
  }, [currentStep, selectedPickupId]);

  // Active phase badge
  const phaseBadge = useMemo(() => {
    const t = currentStep.event_type;
    if (t === 'dijkstra_init') return { label: 'DIJKSTRA • INIT', bg: 'bg-sky-100 text-sky-800 border-sky-300' };
    if (t === 'dijkstra_pop') return { label: 'DIJKSTRA • POP', bg: 'bg-amber-100 text-amber-800 border-amber-300' };
    if (t === 'dijkstra_relax') return { label: 'DIJKSTRA • RELAX', bg: 'bg-amber-100 text-amber-800 border-amber-300' };
    if (t === 'greedy_eval') return { label: 'GREEDY CHECK', bg: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
    if (t === 'route_confirm') return { label: 'ROUTE CONFIRMED', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    return { label: 'SIMULATION IDLE', bg: 'bg-slate-100 text-slate-700 border-slate-300' };
  }, [currentStep.event_type]);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-slate-800">
      {/* 1. Pickup Walkthrough Selector Tabs (Top of Left Panel) */}
      <div className="p-2 border-b border-slate-200 bg-slate-50/90 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Pickup Walkthrough Focus:
          </span>
          {/* Dispatch order dropdown */}
          <div className="flex items-center gap-1">
            <span className="text-[9.5px] font-semibold text-slate-500 uppercase">Order:</span>
            <select
              value={dispatchOrder}
              onChange={(e) => onSetDispatchOrder(e.target.value)}
              className="text-[11px] font-semibold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 shadow-2xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="default">Default (FIFO)</option>
              <option value="heaviest_first">Heaviest First</option>
              <option value="lightest_first">Lightest First</option>
            </select>
          </div>
        </div>

        {/* Tab Buttons for P1, P2, P3, P4 + All Summary */}
        <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
          {pickups.map((p) => {
            const isSelected = selectedPickupId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPickupTab(p.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLORS[p.waste_type] || '#64748B' }}
                />
                <span>{p.id}</span>
                <span className={`text-[10px] font-normal ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                  {p.name.split(' ')[0]}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onSelectPickupTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
              selectedPickupId === 'ALL'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>All Summary</span>
          </button>
        </div>

        {/* Playback Controls (Active when a single pickup is selected or Run All is active) */}
        {selectedPickupId !== 'ALL' ? (
          <div className="flex items-center justify-between gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onResetStep}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Reset to Step 1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onPrevStep}
                disabled={currentStepIndex <= 0 || isRunAll}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                title="Previous Step"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>

              {/* Single Pickup Play/Pause */}
              <button
                type="button"
                onClick={onPlayPause}
                disabled={isRunAll}
                className={`px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs ${
                  isRunAll
                    ? 'opacity-40 bg-slate-100 text-slate-400 cursor-not-allowed'
                    : isPlaying
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
                title="Play Current Pickup"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              {/* Run All Sequential Multi-Pickup Simulation Mode */}
              {isRunAll ? (
                <button
                  type="button"
                  onClick={onStopAll}
                  className="px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300"
                  title="Stop Sequential Simulation"
                >
                  <Square className="w-3.5 h-3.5 fill-rose-600 text-rose-600" />
                  <span>Stop All ({currentRunAllIndex + 1}/{totalPickups})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRunAll}
                  className="px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
                  title="Run All Pickups Sequentially (Wipes Clean Between Pickups)"
                >
                  <Play className="w-3.5 h-3.5 fill-emerald-700 text-emerald-700" />
                  <span>Run All</span>
                </button>
              )}

              <button
                type="button"
                onClick={onNextStep}
                disabled={currentStepIndex >= totalSteps - 1 || isRunAll}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                title="Next Step"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 font-mono text-xs text-slate-600 pr-1">
              <span className="font-bold text-slate-900">Step {currentStepIndex + 1}</span>
              <span className="text-slate-400">/ {totalSteps || 1}</span>
            </div>

            {/* Playback speed pills */}
            <div className="flex items-center gap-0.5">
              {[0.5, 1, 2].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSetSpeed(s)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                    playbackSpeed === s
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* All Summary Playback Bar */
          <div className="flex items-center justify-between gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-semibold text-slate-600 pl-1">All Pickups Optimization Summary</span>
            <button
              type="button"
              onClick={onRunAll}
              className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Play className="w-3.5 h-3.5 fill-white text-white" />
              <span>Run All Simulation</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Main Content Area */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {selectedPickupId !== 'ALL' ? (
          <>
            {/* Sleek Compact Pickup Target & Route Bar */}
            <div className="px-3 py-2 rounded-xl bg-linear-to-r from-emerald-50/90 via-white to-slate-50 border border-emerald-200/90 shadow-2xs flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs ring-1 ring-white"
                  style={{ backgroundColor: CATEGORY_COLORS[currentWalkthrough?.waste_type || activePickupNode?.waste_type] || '#EA580C' }}
                />
                <span className="font-extrabold text-slate-900 truncate">
                  {activePickupNode?.name || currentWalkthrough?.pickup_id || selectedPickupId}
                </span>
                <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                  ({currentWalkthrough?.weight_kg || activePickupNode?.weight_kg || 12}kg {currentWalkthrough?.waste_type || activePickupNode?.waste_type || 'Batteries'})
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-400 font-bold">→</span>
                <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                  {activeAllocation?.assigned_centre_name || 'Mayapuri Hub'} ({formatCost(metric === 'time' ? (activeAllocation?.total_time_min ?? 17.0) : (activeAllocation?.total_distance_km ?? 10.0), metric === 'time' ? 'min' : 'km')})
                </span>
              </div>
            </div>

            {/* Plain-English Live Narrator Banner */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${phaseBadge.bg}`}>
                  {phaseBadge.label}
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {currentWalkthrough?.pickup_id} • {currentWalkthrough?.waste_type} ({currentWalkthrough?.weight_kg} kg)
                </span>
              </div>
              <p className="text-xs text-slate-800 font-medium leading-relaxed">
                {currentStep.caption || 'Ready to run Dijkstra & Greedy allocation.'}
              </p>
            </div>

            {/* Reroute Detected Callout (when disruption changed active path) */}
            {rerouteNotice && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-1.5 animate-in fade-in">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Reroute Detected</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {rerouteNotice.message}
                </p>
                <div className="pt-1 flex items-center justify-between text-[10px] font-mono border-t border-amber-200/80">
                  <span className="text-rose-700 line-through">Old: {rerouteNotice.oldPath?.join(' → ')}</span>
                  <span className="text-emerald-800 font-bold">New: {rerouteNotice.newPath?.join(' → ')}</span>
                </div>
              </div>
            )}

            {/* Light-Theme Algorithm Pseudocode Card */}
            <div className="p-3 rounded-xl border border-slate-200/90 bg-slate-50 shadow-2xs space-y-1.5 font-mono text-[11.5px]">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  ALGORITHM PSEUDOCODE
                </span>
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px] font-medium">
                  Line {activeCodeLine || 1} executing
                </span>
              </div>
              <div className="space-y-1 pt-0.5">
                {PSEUDOCODE_LINES.map(({ line, text }) => {
                  const isExecuting = activeCodeLine === line;
                  return (
                    <div
                      key={line}
                      className={`pseudocode-line leading-snug transition-colors ${
                        isExecuting
                          ? 'bg-emerald-50 text-emerald-950 font-semibold border-l-[3px] border-emerald-500 px-2.5 py-1.5 rounded-r-lg shadow-2xs'
                          : 'text-slate-600 px-2.5 py-1.5 rounded-lg hover:bg-slate-100/60'
                      }`}
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}
                    >
                      {text}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Min-Heap Priority Queue Strip */}
            {currentStep.heap && currentStep.heap.length > 0 && (
              <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-amber-500" />
                    Min-Heap Priority Queue
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Front is Next Pop
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {currentStep.heap.map((item, idx) => (
                    <div
                      key={idx}
                      className={`px-2 py-1 rounded text-[10.5px] font-mono flex items-center gap-1.5 border ${
                        idx === 0
                          ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold ring-2 ring-amber-300/60'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      {idx === 0 && (
                        <span className="text-[8px] px-1 rounded bg-amber-500 text-white font-extrabold uppercase">
                          Next
                        </span>
                      )}
                      <span className="font-bold">{item.node}</span>
                      <span className={idx === 0 ? 'text-amber-700' : 'text-slate-500'}>
                        ({formatCost(item.cost, metric === 'time' ? 'min' : 'km')})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Candidate Evaluation Card during Greedy & Confirmation steps */}
            {currentStep.candidate_checklist && currentStep.candidate_checklist.length > 0 && (
              <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-500">
                    Candidate Centres (Dijkstra Ordered)
                  </span>
                  <span className="text-[10px] text-slate-400">Greedy Eligibility Check</span>
                </div>

                <div className="space-y-1.5">
                  {currentStep.candidate_checklist.map((c, i) => {
                    const isAssigned = c.status_badge === 'assigned';
                    return (
                      <div
                        key={i}
                        className={`p-2.5 rounded-lg border text-xs transition-all ${
                          isAssigned
                            ? 'border-emerald-500 bg-emerald-50/60'
                            : 'border-slate-200 bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {isAssigned ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                            )}
                            <span className="font-bold text-slate-900">{c.centre_name}</span>
                            <span className="text-[10px] font-mono text-slate-500">({c.centre_id})</span>
                          </div>
                          <span className="font-mono font-bold text-xs text-slate-800">
                            {formatCost(c.cost, metric === 'time' ? 'min' : 'km')}
                          </span>
                        </div>

                        {/* Status Reason */}
                        <div className="flex items-center justify-between text-[11px] pt-0.5">
                          <span
                            className={`font-semibold ${
                              isAssigned
                                ? 'text-emerald-700'
                                : c.status_badge === 'capacity_full'
                                ? 'text-rose-600'
                                : c.status_badge === 'wrong_category'
                                ? 'text-amber-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {c.reason}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {formatCost(c.distance_km, 'km')} • {formatCost(c.time_min, 'min')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          /* All Pickups Summary Tab View */
          <div className="space-y-4">
            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total E-Waste</span>
                <div className="text-xl font-mono font-extrabold text-slate-900 mt-0.5">
                  {greedySummary?.total_routed_kg || 0} <span className="text-xs font-sans text-slate-500">kg</span>
                </div>
                <span className="text-[10px] text-emerald-700 font-semibold">
                  {greedySummary?.assigned_pickups || 0} / {greedySummary?.total_pickups || 0} Pickups Routed
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Fleet Cost</span>
                <div className="text-xl font-mono font-extrabold text-slate-900 mt-0.5">
                  {metric === 'time'
                    ? `${greedySummary?.total_time_min || 0} min`
                    : `${greedySummary?.total_distance_km || 0} km`}
                </div>
                <span className="text-[10px] text-slate-500 font-medium">
                  {greedySummary?.total_distance_km || 0} km total distance
                </span>
              </div>
            </div>

            {/* All Final Allocations Table */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Final Pickup Allocations
              </span>
              <div className="space-y-2">
                {greedySummary?.allocations?.map((alloc) => (
                  <div
                    key={alloc.pickup_id}
                    className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/60 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[alloc.waste_type] || '#64748B' }}
                        />
                        <span className="font-bold text-slate-900">{alloc.pickup_name}</span>
                        <span className="text-[10px] font-mono text-slate-500">({alloc.pickup_id})</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-700">
                        {alloc.total_time_min} min • {alloc.total_distance_km} km
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600">
                      <span>
                        Destination: <strong>{alloc.assigned_centre_name || 'Unassigned'}</strong>
                      </span>
                      <span className="font-mono text-slate-500">
                        {alloc.weight_kg} kg {alloc.waste_type}
                      </span>
                    </div>

                    <div className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Path: {alloc.path_nodes?.join(' → ') || 'No route'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dijkstra Distance Matrix Table */}
            <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500">
                  Dijkstra Shortest Paths Matrix ({metric})
                </span>
                <span className="text-[10px] text-slate-400">Hover to preview</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-1.5 px-2 font-bold">Pickup</th>
                      <th className="py-1.5 px-2 font-bold">Category</th>
                      {centres.map((c) => (
                        <th key={c.id} className="py-1.5 px-2 font-bold text-center">
                          {c.id}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pickups.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-1.5 px-2 font-bold text-slate-900 font-mono">{p.id}</td>
                        <td className="py-1.5 px-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white inline-block"
                            style={{ backgroundColor: CATEGORY_COLORS[p.waste_type] || '#64748B' }}
                          >
                            {p.waste_type}
                          </span>
                        </td>
                        {centres.map((c) => {
                          const dist = distanceMatrix[p.id]?.[c.id];
                          const alloc = greedySummary?.allocations?.find((a) => a.pickup_id === p.id);
                          const isAssigned = alloc?.assigned_centre_id === c.id;
                          return (
                            <td
                              key={c.id}
                              onMouseEnter={() => onPreviewPath(p.id, c.id)}
                              className={`py-1.5 px-2 font-mono text-center cursor-pointer ${
                                isAssigned
                                  ? 'bg-emerald-100 font-bold text-emerald-900 rounded'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {formatCost(dist, metric === 'time' ? 'min' : 'km')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Global Optimal vs Greedy Comparison */}
            {optimalSummary && (
              <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/40 text-xs space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-indigo-900 block">
                  Combinatorial Global Optimum Benchmark
                </span>
                <p className="text-[11px] text-indigo-950 leading-relaxed">
                  Greedy: {greedySummary?.total_routed_kg} kg in{' '}
                  {metric === 'time' ? `${greedySummary?.total_time_min} min` : `${greedySummary?.total_distance_km} km`}{' '}
                  ({greedySummary?.execution_time_ms} ms) vs Global Optimal ({optimalSummary.execution_time_ms} ms).
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Quick Disruption Presets Bar (Bottom) */}
      <div className="p-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Disruptions:
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onApplyDisruptionPreset('block_hub')}
            className="px-2 py-1 rounded bg-white hover:bg-rose-50 border border-slate-200 text-rose-700 text-[11px] font-semibold transition-colors"
            title="Block Dhaula Kuan ↔ Mahipalpur (J1 ↔ J2)"
          >
            ⛔ Block J1↔J2
          </button>
          <button
            type="button"
            onClick={() => onApplyDisruptionPreset('peak_traffic')}
            className="px-2 py-1 rounded bg-white hover:bg-amber-50 border border-slate-200 text-amber-700 text-[11px] font-semibold transition-colors"
            title="Set 2.5x traffic on arterial transit corridors"
          >
            ⚠️ Peak Traffic
          </button>
          <button
            type="button"
            onClick={() => onApplyDisruptionPreset('clear_all')}
            className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
            title="Reset all road edges to 1.0x normal"
          >
            ✓ Clear All
          </button>
        </div>
      </div>
    </div>
  );
}
