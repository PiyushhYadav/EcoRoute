import React, { useRef, useEffect, useState } from 'react';
import { X, AlertTriangle, ShieldAlert, CheckCircle2, Trash2, ArrowRight } from 'lucide-react';

export default function DisruptionModal({ edge, nodesMap, isOpen, onClose, onSave, onDelete }) {
  const dialogRef = useRef(null);

  const [baseDistance, setBaseDistance] = useState(1.0);
  const [baseTime, setBaseTime] = useState(1.5);
  const [trafficMultiplier, setTrafficMultiplier] = useState(1.0);
  const [isBlocked, setIsBlocked] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (edge) {
      setBaseDistance(edge.base_distance_km || 1.0);
      setBaseTime(edge.base_time_min || 1.5);
      setTrafficMultiplier(edge.traffic_multiplier || 1.0);
      setIsBlocked(edge.is_blocked || 0);
    }
  }, [edge]);

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

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  const handleSave = async () => {
    if (!edge) return;
    setLoading(true);
    try {
      await onSave(edge.id, {
        base_distance_km: parseFloat(baseDistance),
        base_time_min: parseFloat(baseTime),
        traffic_multiplier: parseFloat(trafficMultiplier),
        is_blocked: parseInt(isBlocked, 10),
      });
      onClose();
    } catch (err) {
      alert(`Failed to update road edge: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!edge) return;
    if (!window.confirm(`Delete road edge ${edge.id} connecting ${sourceNode?.name} and ${targetNode?.name}?`)) {
      return;
    }
    setLoading(true);
    try {
      await onDelete(edge.id);
      onClose();
    } catch (err) {
      alert(`Failed to delete road edge: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !edge) return null;

  const sourceNode = nodesMap[edge.source_id] || { name: edge.source_id, id: edge.source_id };
  const targetNode = nodesMap[edge.target_id] || { name: edge.target_id, id: edge.target_id };

  const effectiveDist = isBlocked
    ? '∞ (Blocked)'
    : `${(parseFloat(baseDistance) * parseFloat(trafficMultiplier)).toFixed(1)} km`;

  const effectiveTime = isBlocked
    ? '∞ (Blocked)'
    : `${(parseFloat(baseTime) * parseFloat(trafficMultiplier)).toFixed(1)} min`;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={onClose}
      aria-labelledby="disruption-modal-title"
      className="fixed inset-0 m-auto p-0 max-w-lg w-[90vw] bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800 overflow-hidden z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h3 id="disruption-modal-title" className="text-sm font-bold text-slate-900">
              Road Edge Disruption & Traffic Control
            </h3>
            <p className="text-xs text-slate-500 font-mono">Edge ID: {edge.id}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          aria-label="Close disruption editor"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4 text-xs">
        {/* Nodes Pair */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex-1">
            <span className="text-[10px] uppercase font-bold text-slate-400">Source Node</span>
            <p className="font-semibold text-slate-900 truncate">{sourceNode.name}</p>
            <span className="text-[11px] font-mono text-slate-500">{sourceNode.id}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 mx-2 shrink-0" />
          <div className="flex-1 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400">Target Node</span>
            <p className="font-semibold text-slate-900 truncate">{targetNode.name}</p>
            <span className="text-[11px] font-mono text-slate-500">{targetNode.id}</span>
          </div>
        </div>

        {/* Condition Selector */}
        <div>
          <label className="font-bold text-slate-700 block mb-1.5">Traffic State Condition</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setIsBlocked(0);
                setTrafficMultiplier(1.0);
              }}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                !isBlocked && trafficMultiplier === 1.0
                  ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-bold shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
              <div className="text-[11px]">Normal</div>
              <div className="text-[10px] font-mono text-slate-400">1.0× Speed</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsBlocked(0);
                setTrafficMultiplier(2.5);
              }}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                !isBlocked && trafficMultiplier > 1.0
                  ? 'border-amber-500 bg-amber-50/70 text-amber-900 font-bold shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-amber-600" />
              <div className="text-[11px]">Heavy Traffic</div>
              <div className="text-[10px] font-mono text-amber-700">2.5× Delay</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsBlocked(1);
              }}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                isBlocked
                  ? 'border-rose-500 bg-rose-50/70 text-rose-900 font-bold shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <ShieldAlert className="w-4 h-4 mx-auto mb-1 text-rose-600" />
              <div className="text-[11px]">Roadblock</div>
              <div className="text-[10px] font-mono text-rose-700">Closed (∞)</div>
            </button>
          </div>
        </div>

        {/* Dual Weights: Distance & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Base Distance (km)</label>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={baseDistance}
              onChange={(e) => setBaseDistance(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Base Time (min)</label>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={baseTime}
              onChange={(e) => setBaseTime(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Live Effective Cost Display */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Effective Distance</span>
            <div className="w-full mt-0.5 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 font-mono text-xs font-semibold text-slate-800">
              {effectiveDist}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Effective Time</span>
            <div className="w-full mt-0.5 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 font-mono text-xs font-semibold text-slate-800">
              {effectiveTime}
            </div>
          </div>
        </div>

        {/* Note */}
        <p className="text-[11px] text-slate-500 leading-normal">
          Changes take effect immediately on save, triggering Dijkstra recalculation and live vehicle rerouting across the network.
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 rounded hover:bg-rose-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Road
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
          >
            {loading ? 'Updating...' : 'Apply Disruption'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
