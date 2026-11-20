import React, { useRef, useEffect, useState } from 'react';
import {
  X,
  Trash2,
  Check,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  AlertTriangle,
  Battery,
  Monitor,
  Smartphone,
  Tv,
  Recycle,
} from 'lucide-react';

const STREAM_CONFIG = {
  Batteries: {
    label: 'Batteries',
    sublabel: 'Lithium-Ion / UPS',
    color: '#EA580C',
    activeBg: 'border-amber-500 bg-amber-50/70 text-amber-900',
    badgeBg: 'bg-amber-100 text-amber-700',
    icon: Battery,
  },
  Computers: {
    label: 'Computers',
    sublabel: 'PC / Laptops / PCBs',
    color: '#7C3AED',
    activeBg: 'border-purple-500 bg-purple-50/70 text-purple-900',
    badgeBg: 'bg-purple-100 text-purple-700',
    icon: Monitor,
  },
  Smartphones: {
    label: 'Smartphones',
    sublabel: 'Phones & Tablets',
    color: '#0284C7',
    activeBg: 'border-sky-500 bg-sky-50/70 text-sky-900',
    badgeBg: 'bg-sky-100 text-sky-700',
    icon: Smartphone,
  },
  Appliances: {
    label: 'Appliances',
    sublabel: 'White Goods / AC',
    color: '#0D9488',
    activeBg: 'border-teal-500 bg-teal-50/70 text-teal-900',
    badgeBg: 'bg-teal-100 text-teal-700',
    icon: Tv,
  },
};

export default function NodeConfigModal({
  node,
  isOpen,
  onClose,
  onSave,
  onDelete,
  allocations = [],
  centreCapacities = {},
  pickupsCount = 4,
  centresCount = 3,
}) {
  const dialogRef = useRef(null);

  // Common State
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Pickup Specific State
  const [wasteCategory, setWasteCategory] = useState('Batteries');
  const [weightKg, setWeightKg] = useState(12);

  // Centre Specific State
  const [capacityKg, setCapacityKg] = useState(25);
  const [acceptedCategories, setAcceptedCategories] = useState([
    'Batteries',
    'Computers',
    'Smartphones',
    'Appliances',
  ]);
  const [isActive, setIsActive] = useState(true);

  // Sync state whenever node or isOpen changes
  useEffect(() => {
    if (node) {
      setName(node.name || '');

      // Pickup
      setWasteCategory(node.waste_category || node.waste_type || 'Batteries');
      setWeightKg(node.weight_kg != null ? Number(node.weight_kg) : 12);

      // Centre
      const cap =
        node.capacity_kg != null
          ? Number(node.capacity_kg)
          : node.max_capacity_kg != null
          ? Number(node.max_capacity_kg)
          : 25;
      setCapacityKg(cap);

      const accepted =
        Array.isArray(node.accepted_categories) && node.accepted_categories.length > 0
          ? node.accepted_categories
          : Array.isArray(node.accepted_types) && node.accepted_types.length > 0
          ? node.accepted_types
          : ['Batteries', 'Computers', 'Smartphones', 'Appliances'];
      setAcceptedCategories([...accepted]);

      const activeState =
        node.is_active !== undefined
          ? Boolean(node.is_active)
          : node.status !== 'maintenance' && node.status !== 'offline';
      setIsActive(activeState);
    }
  }, [node, isOpen]);

  // Modal dialog trigger
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

  if (!isOpen || !node) return null;

  const isPickup = node.kind === 'pickup' || (node.id && node.id.startsWith('P'));
  const isCentre = node.kind === 'centre' || (node.id && node.id.startsWith('R'));

  // Multi-select stream toggle for recycling centres
  const toggleAcceptedStream = (streamKey) => {
    if (acceptedCategories.includes(streamKey)) {
      if (isActive && acceptedCategories.length <= 1) {
        return; // Prevent deselecting all streams while Active
      }
      setAcceptedCategories(acceptedCategories.filter((s) => s !== streamKey));
    } else {
      setAcceptedCategories([...acceptedCategories, streamKey]);
    }
  };

  const handleSave = async () => {
    if (!node) return;
    setLoading(true);
    try {
      if (isPickup) {
        const parsedWeight = parseFloat(weightKg);
        if (!parsedWeight || parsedWeight <= 0) {
          alert('Pickup weight must be greater than 0 kg.');
          setLoading(false);
          return;
        }
        await onSave(node.id, {
          name: name.trim() || node.name,
          waste_category: wasteCategory,
          weight_kg: parsedWeight,
        });
      } else {
        const parsedCap = parseFloat(capacityKg);
        if (parsedCap == null || parsedCap < 0 || isNaN(parsedCap)) {
          alert('Site capacity must be greater than or equal to 0 kg.');
          setLoading(false);
          return;
        }
        if (isActive && acceptedCategories.length === 0) {
          alert('An active recycling site must accept at least one e-waste stream.');
          setLoading(false);
          return;
        }
        await onSave(node.id, {
          name: name.trim() || node.name,
          capacity_kg: parsedCap,
          accepted_categories: acceptedCategories,
          is_active: Boolean(isActive),
        });
      }
      onClose();
    } catch (err) {
      alert(`Failed to update ${isPickup ? 'pickup' : 'site'}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!node) return;
    const label = isPickup ? 'pickup spot' : 'recycling site';
    if (!window.confirm(`Are you sure you want to delete ${label} "${node.name}" (${node.id})? Connected roads will be cleanly removed.`)) {
      return;
    }
    setLoading(true);
    try {
      await onDelete(node.id);
      onClose();
    } catch (err) {
      alert(`Failed to delete ${label}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Find allocation for summary cards
  const alloc = isPickup ? allocations.find((a) => a.pickup_id === node.id) : null;

  // Calculate live utilization for Centre
  const assignedWeight = isCentre
    ? allocations
        .filter((a) => a.status === 'assigned' && a.assigned_centre_id === node.id)
        .reduce((sum, a) => sum + (Number(a.weight_kg) || 0), 0)
    : 0;
  const currentLoad =
    isCentre && centreCapacities && centreCapacities[node.id]?.used != null
      ? Number(centreCapacities[node.id].used)
      : assignedWeight;
  const totalCap = Number(capacityKg) || 0;
  const remCap = Math.max(0, totalCap - currentLoad);
  const loadPct = totalCap > 0 ? Math.min(100, Math.round((currentLoad / totalCap) * 100)) : 0;
  const barColor = loadPct >= 90 ? 'bg-rose-500' : loadPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';

  const isOnlyPickup = isPickup && pickupsCount <= 1;
  const isOnlyCentre = isCentre && centresCount <= 1;

  const currentStreamCfg = STREAM_CONFIG[wasteCategory] || STREAM_CONFIG.Batteries;
  const CategoryIcon = currentStreamCfg.icon;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={onClose}
      aria-labelledby="node-config-modal-title"
      className="fixed inset-0 m-auto p-0 max-w-lg w-[90vw] bg-white rounded-2xl shadow-2xl border border-slate-200 text-slate-800 overflow-hidden z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center gap-2.5">
          {isPickup ? (
            <div className={`w-8 h-8 rounded-lg ${currentStreamCfg.badgeBg} flex items-center justify-center`}>
              <CategoryIcon className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Recycle className="w-4 h-4" />
            </div>
          )}
          <div>
            <h3 id="node-config-modal-title" className="text-sm font-bold text-slate-900">
              {isPickup ? 'Pickup Spot Configuration' : 'Recycling Site Configuration'}
            </h3>
            <p className="text-xs text-slate-500 font-mono">Node ID: {node.id}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          aria-label="Close configuration modal"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[calc(90vh-140px)]">
        {/* Top Summary Card */}
        {isPickup ? (
          alloc && alloc.status === 'assigned' && alloc.assigned_centre_name ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Pickup Location</span>
                <p className="font-semibold text-slate-900 truncate">
                  {name || node.name} ({node.id})
                </p>
                <span className="text-[11px] font-mono text-slate-500">
                  {weightKg} kg {wasteCategory}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 mx-2 shrink-0" />
              <div className="flex-1 min-w-0 text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Destination</span>
                <p className="font-semibold text-emerald-700 truncate">
                  {alloc.assigned_centre_name} ({alloc.assigned_centre_id})
                </p>
                <span className="text-[11px] font-mono text-slate-500">
                  {alloc.total_time_min != null && alloc.total_time_min > 0
                    ? `${alloc.total_time_min.toFixed(1)} min`
                    : alloc.total_distance_km != null
                    ? `${alloc.total_distance_km.toFixed(1)} km`
                    : `${alloc.total_cost?.toFixed(1) || '0.0'} min`}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-amber-700 block">Current Assignment</span>
                <p className="font-semibold text-amber-900 truncate">
                  Unassigned — {alloc?.rejection_reason || 'No eligible recycling centre available'}
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Live Site Utilization</span>
              <span className="font-mono text-slate-600">
                <strong className="text-slate-900">{currentLoad.toFixed(1)}</strong> / {totalCap.toFixed(1)} kg (
                {remCap.toFixed(1)} kg free)
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full ${barColor} transition-all duration-300 rounded-full`}
                style={{ width: `${loadPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5 font-mono">
              <span>{loadPct}% capacity allocated</span>
              <span className={isActive ? 'text-emerald-700 font-semibold' : 'text-rose-600 font-semibold'}>
                {isActive ? 'Accepting e-waste' : 'Offline / Maintenance'}
              </span>
            </div>
          </div>
        )}

        {/* Form Controls - PICKUP SPOT */}
        {isPickup && (
          <>
            {/* Location Name */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Location Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Janakpuri West"
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            {/* E-Waste Stream Selector */}
            <div>
              <label className="font-bold text-slate-700 block mb-1.5">E-Waste Stream Selector</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(STREAM_CONFIG).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  const isSelected = wasteCategory === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setWasteCategory(key)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        isSelected
                          ? `${cfg.activeBg} font-bold shadow-sm`
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Icon
                        className="w-4 h-4 mx-auto mb-1"
                        style={{ color: isSelected ? cfg.color : '#64748B' }}
                      />
                      <div className="text-[11px] leading-tight">{cfg.label}</div>
                      <div className="text-[9.5px] font-mono text-slate-400 mt-0.5">{cfg.sublabel}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pickup Weight */}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Pickup Weight (kg)</label>
              <input
                type="number"
                min="1"
                max="200"
                step="1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </>
        )}

        {/* Form Controls - RECYCLING SITE */}
        {isCentre && (
          <>
            {/* Operational Status */}
            <div>
              <label className="font-bold text-slate-700 block mb-1.5">Operational Status</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsActive(true)}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    isActive
                      ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 font-bold shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
                  <div className="text-[11px]">Active</div>
                  <div className="text-[10px] font-mono text-slate-400">Accepting e-waste</div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsActive(false)}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    !isActive
                      ? 'border-rose-500 bg-rose-50/70 text-rose-900 font-bold shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 mx-auto mb-1 text-rose-600" />
                  <div className="text-[11px]">Maintenance</div>
                  <div className="text-[10px] font-mono text-rose-700">Site Closed / Offline</div>
                </button>
              </div>
            </div>

            {/* Site Name & Total Capacity Side-by-Side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Site Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Mayapuri Hub"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-900 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Total Capacity (kg)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={capacityKg}
                  onChange={(e) => setCapacityKg(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Accepted E-Waste Streams Multi-select */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-bold text-slate-700 block">Accepted E-Waste Streams</label>
                <span className="text-[10px] text-slate-400 font-mono">
                  {acceptedCategories.length} / 4 streams
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(STREAM_CONFIG).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  const isChecked = acceptedCategories.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleAcceptedStream(key)}
                      className={`p-2.5 rounded-xl border text-center transition-all relative ${
                        isChecked
                          ? `${cfg.activeBg} font-bold shadow-sm`
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 opacity-60'
                      }`}
                    >
                      {isChecked && (
                        <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                      <Icon
                        className="w-4 h-4 mx-auto mb-1"
                        style={{ color: isChecked ? cfg.color : '#94A3B8' }}
                      />
                      <div className="text-[11px] leading-tight">{cfg.label}</div>
                      <div className="text-[9.5px] font-mono mt-0.5 opacity-80">
                        {isChecked ? 'Accepted' : 'Excluded'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Footer Explanatory Note */}
        <p className="text-[11px] text-slate-500 leading-normal pt-1">
          {isPickup
            ? 'Changes take effect immediately on save, triggering Dijkstra recalculation and live assignment updates across the network.'
            : 'Changes take effect immediately on save, triggering Dijkstra recalculation and live vehicle rerouting across the network.'}
        </p>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading || (isPickup ? isOnlyPickup : isOnlyCentre)}
          title={
            isPickup && isOnlyPickup
              ? 'At least 1 pickup spot is required'
              : isCentre && isOnlyCentre
              ? 'At least 1 recycling site is required'
              : `Delete ${isPickup ? 'Pickup' : 'Site'}`
          }
          className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded transition-colors ${
            (isPickup ? isOnlyPickup : isOnlyCentre)
              ? 'text-slate-400 cursor-not-allowed bg-slate-100'
              : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {isPickup ? 'Delete Pickup' : 'Delete Site'}
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
            {loading ? 'Saving...' : isPickup ? 'Save Pickup' : 'Save Site'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
