import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Truck,
  PlusCircle,
  Trash2,
  CheckCircle2,
  Scale,
  Sparkles,
  ArrowRight,
  Info,
  Clock,
  Compass,
  Crosshair,
} from 'lucide-react';
import { api } from '../api/client';

const CATEGORIES = [
  { id: 'Batteries', label: 'Batteries', color: '#D97706', desc: 'Lithium-ion, UPS lead-acid' },
  { id: 'Computers', label: 'Computers', color: '#7C3AED', desc: 'Desktops, laptops, server PCBs' },
  { id: 'Smartphones', label: 'Smartphones', color: '#0284C7', desc: 'Phones, tablets, compact gadgets' },
  { id: 'Appliances', label: 'Appliances', color: '#0D9488', desc: 'Refrigerators, microwaves, AC units' },
];

function latlngFromXY(x, y) {
  const lng = 77.0 + (x / 1000.0) * 0.3;
  const lat = 28.85 - (y / 660.0) * 0.4;
  return [Math.round(lat * 10000) / 10000, Math.round(lng * 10000) / 10000];
}

function xyFromLatlng(lat, lng) {
  const x = Math.max(0, Math.min(1000, ((lng - 77.0) / 0.3) * 1000.0));
  const y = Math.max(0, Math.min(660, ((28.85 - lat) / 0.4) * 660.0));
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

export default function SchedulePage() {
  const navigate = useNavigate();
  const svgRef = useRef(null);

  // Target pin coordinates (SVG 0..1000, 0..660)
  const [targetX, setTargetX] = useState(580);
  const [targetY, setTargetY] = useState(380);

  // Form State
  const [name, setName] = useState('Saket Business District');
  const [lat, setLat] = useState(28.5244);
  const [lng, setLng] = useState(77.2185);
  const [wasteType, setWasteType] = useState('Smartphones');
  const [weightKg, setWeightKg] = useState(14);
  const [donorName, setDonorName] = useState('GreenTech Enterprises');

  // Existing graph state for background reference
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [successToast, setSuccessToast] = useState(null);

  const loadGraph = async () => {
    try {
      const data = await api.getGraph();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (err) {
      console.error('Failed to load graph:', err);
    }
  };

  useEffect(() => {
    loadGraph();
  }, []);

  // Sync lat/lng when targetX/Y changes
  const handleLocationChange = (newX, newY) => {
    const clampedX = Math.max(40, Math.min(960, Math.round(newX)));
    const clampedY = Math.max(40, Math.min(620, Math.round(newY)));
    setTargetX(clampedX);
    setTargetY(clampedY);
    const [computedLat, computedLng] = latlngFromXY(clampedX, clampedY);
    setLat(computedLat);
    setLng(computedLng);
  };

  // SVG Click Handler for precise coordinate placement
  const handleSvgClick = (e) => {
    if (!svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());
    handleLocationChange(svgPt.x, svgPt.y);
  };

  const pickups = useMemo(() => nodes.filter((n) => n.kind === 'pickup'), [nodes]);
  const nodesMap = useMemo(() => {
    const map = {};
    nodes.forEach((n) => {
      map[n.id] = n;
    });
    return map;
  }, [nodes]);

  const selectedCategory = CATEGORIES.find((c) => c.id === wasteType) || CATEGORIES[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Please enter a location name');
      return;
    }

    setLoading(true);
    try {
      const created = await api.createPickup({
        name,
        lat,
        lng,
        x: targetX,
        y: targetY,
        waste_type: wasteType,
        weight_kg: parseFloat(weightKg),
        donor_name: donorName,
      });

      setSuccessToast(`Pickup "${created.name}" created at (${targetX}, ${targetY}) & auto-connected to network!`);
      await loadGraph();

      setTimeout(() => {
        setSuccessToast(null);
      }, 5000);
    } catch (err) {
      alert(`Failed to create pickup: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, pName) => {
    if (!window.confirm(`Delete pickup request ${id} (${pName})?`)) return;
    try {
      await api.deletePickup(id);
      await loadGraph();
    } catch (err) {
      alert(`Failed to delete pickup: ${err.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 text-slate-800">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <MapPin className="w-6 h-6 text-emerald-600" />
            Schedule New E-Waste Pickup Request
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Click anywhere on the interactive Delhi NCR SVG map to drop a pickup pin. Our algorithm automatically connects it to the 2 nearest transit junctions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/dispatch')}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <span>View in Live Dispatch</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Success Notification Banner */}
      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between shadow-xs text-emerald-900 text-xs font-semibold animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Left Form (~40%) + Right Interactive SVG Map (~60%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form Column */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Pickup Location & Details
              </span>
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-bold">
                X: {targetX}, Y: {targetY}
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Location Name */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Location / Area Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Saket District Centre"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>

              {/* Coordinates Preview */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Canvas X (0..1000)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="970"
                    value={targetX}
                    onChange={(e) => handleLocationChange(parseFloat(e.target.value) || 500, targetY)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Canvas Y (0..660)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="630"
                    value={targetY}
                    onChange={(e) => handleLocationChange(targetX, parseFloat(e.target.value) || 330)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Waste Category Selector */}
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">
                  Waste Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setWasteType(cat.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 cursor-pointer ${
                        wasteType === cat.id
                          ? 'border-emerald-600 bg-emerald-50/50 shadow-2xs'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-slate-900">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-xs">{cat.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-normal leading-tight">
                        {cat.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Weight & Donor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="0.5"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Donor / Tech Entity
                  </label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    placeholder="e.g. DLF Tech"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{loading ? 'Adding & Connecting...' : 'Schedule Pickup & Connect to Network'}</span>
              </button>
            </form>
          </div>

          {/* List of Active Pickups */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Active Pickups in Network ({pickups.length})
              </span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {pickups.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORIES.find((c) => c.id === p.waste_type)?.color || '#64748B' }}
                    />
                    <div>
                      <span className="font-bold text-slate-900">{p.name}</span>
                      <span className="text-[10px] font-mono text-slate-500 ml-1.5">
                        ({p.id} • {p.weight_kg} kg {p.waste_type})
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(p.id, p.name)}
                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title={`Delete pickup ${p.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Click-to-Drop Delhi NCR SVG Map (~60% width) */}
        <div className="lg:col-span-7 flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 overflow-hidden">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Delhi NCR Interactive Map Preview
              </span>
            </div>
            <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border border-emerald-200">
              <Crosshair className="w-3 h-3" />
              Click anywhere to relocate pin
            </span>
          </div>

          <div className="relative flex-1 min-h-[520px] bg-[#F8FAFC] rounded-xl border border-slate-200/90 mt-3 overflow-hidden select-none">
            <svg
              ref={svgRef}
              viewBox="0 0 1000 660"
              className="w-full h-full cursor-crosshair"
              onClick={handleSvgClick}
            >
              <defs>
                {/* Subtle Grid Pattern */}
                <pattern id="sched-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E2E8F0" strokeWidth="0.75" strokeDasharray="3 3" opacity="0.6" />
                </pattern>

                {/* Pin Shadow */}
                <filter id="sched-pin-shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0F172A" floodOpacity="0.25" />
                </filter>
              </defs>

              {/* Background fill & grid */}
              <rect width="1000" height="660" fill="#F8FAFC" />
              <rect width="1000" height="660" fill="url(#sched-grid)" />

              {/* Stylized Delhi NCR Boundary */}
              <polygon
                points="220,50 360,40 520,70 660,110 770,180 840,290 820,430 760,540 640,610 470,630 320,620 200,550 140,430 150,290 170,160"
                fill="#F1F5F9"
                stroke="#CBD5E1"
                strokeWidth="1.75"
                strokeDasharray="6 4"
                opacity="0.8"
              />

              {/* Yamuna River Ribbon */}
              <path
                d="M 520,30 Q 560,140 580,240 T 630,380 T 700,520 T 730,640"
                fill="none"
                stroke="#BFDBFE"
                strokeWidth="14"
                strokeLinecap="round"
                opacity="0.7"
              />
              <path
                d="M 520,30 Q 560,140 580,240 T 630,380 T 700,520 T 730,640"
                fill="none"
                stroke="#60A5FA"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.85"
              />

              {/* Region Watermark Labels */}
              <g className="select-none pointer-events-none text-slate-300 font-extrabold text-[12px] tracking-[0.25em]" opacity="0.65">
                <text x="440" y="110" textAnchor="middle">NORTH DELHI</text>
                <text x="560" y="270" textAnchor="middle">CENTRAL DELHI</text>
                <text x="210" y="470" textAnchor="middle">DWARKA</text>
                <text x="280" y="605" textAnchor="middle">GURUGRAM</text>
                <text x="790" y="490" textAnchor="middle">NOIDA / OKHLA</text>
              </g>

              {/* Existing Graph Edges */}
              <g>
                {edges.map((edge) => {
                  const u = nodesMap[edge.source_id];
                  const v = nodesMap[edge.target_id];
                  if (!u || !v || u.x == null || u.y == null || v.x == null || v.y == null) return null;
                  return (
                    <line
                      key={edge.id}
                      x1={u.x}
                      y1={u.y}
                      x2={v.x}
                      y2={v.y}
                      stroke="#CBD5E1"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  );
                })}
              </g>

              {/* Existing Graph Nodes */}
              <g>
                {nodes.map((node) => {
                  if (node.x == null || node.y == null) return null;
                  const isCentre = node.kind === 'centre';
                  const isPickup = node.kind === 'pickup';
                  const fillColor = isCentre ? '#10B981' : isPickup ? '#F59E0B' : '#94A3B8';
                  const r = isCentre ? 14 : isPickup ? 11 : 8;

                  return (
                    <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                      <circle r={r + 3} fill="#FFFFFF" opacity="0.9" />
                      <circle r={r} fill={fillColor} stroke="#FFFFFF" strokeWidth="2" />
                      <text
                        y="3.5"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize={isCentre ? "9" : "8"}
                        fontWeight="bold"
                        className="pointer-events-none select-none"
                      >
                        {node.id}
                      </text>
                      <text
                        y={r + 14}
                        textAnchor="middle"
                        fill="#475569"
                        fontSize="9"
                        fontWeight="600"
                        className="pointer-events-none select-none"
                      >
                        {node.name}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Interactive Target Drop Pin */}
              <g transform={`translate(${targetX}, ${targetY})`} filter="url(#sched-pin-shadow)">
                {/* Pulsing ring animation */}
                <circle r="22" fill="#10B981" opacity="0.25">
                  <animate attributeName="r" values="14;28;14" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.35;0.05;0.35" dur="2s" repeatCount="indefinite" />
                </circle>

                {/* Pin base point */}
                <circle r="4" fill="#064E3B" />

                {/* Drop Pin Icon */}
                <g transform="translate(0, -22)">
                  <path
                    d="M 0 22 C -2 18 -12 8 -12 -2 C -12 -8.6 -6.6 -14 0 -14 C 6.6 -14 12 -8.6 12 -2 C 12 8 2 18 0 22 Z"
                    fill="#10B981"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                  <circle cx="0" cy="-2" r="4.5" fill="#FFFFFF" />
                  <circle cx="0" cy="-2" r="2" fill="#047857" />
                </g>

                {/* Live Pill Label */}
                <g transform="translate(0, -42)">
                  <rect
                    x="-65"
                    y="-12"
                    width="130"
                    height="20"
                    rx="10"
                    fill="#0F172A"
                    stroke="#10B981"
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="2"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="9"
                    fontWeight="bold"
                    className="select-none pointer-events-none"
                  >
                    📍 Drop: ({targetX}, {targetY})
                  </text>
                </g>
              </g>
            </svg>

            {/* Bottom info pill */}
            <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-xs border border-slate-200/80 shadow-xs flex items-center gap-2 text-[11px] text-slate-600 font-medium pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Coordinates: <strong>({targetX}, {targetY})</strong></span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-400">Pure SVG Delhi NCR Canvas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
