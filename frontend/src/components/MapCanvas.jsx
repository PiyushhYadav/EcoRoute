import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerSource from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
import {
  Search,
  Sliders,
  Plus,
  Compass,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Truck,
  MapPin,
  X,
  Share2,
  Sparkles,
  AlertTriangle,
  Building2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { getMutedMapStyle } from '../utils/mapStyle';

// Load MapLibre Web Worker from self-contained Blob URL
try {
  if (typeof window !== 'undefined' && window.Blob && window.URL) {
    const blob = new Blob([maplibreWorkerSource], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    if (typeof setWorkerUrl === 'function') {
      setWorkerUrl(workerUrl);
    }
  }
} catch (e) {
  console.warn('MapLibre worker blob fallback notice:', e);
}

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

const DEFAULT_CENTER = [77.16, 28.61];
const DEFAULT_ZOOM = 10.7;

// Stylized region watermarks matching reference image
const REGION_WATERMARKS = [
  { name: 'NORTH DELHI', lng: 77.14, lat: 28.72 },
  { name: 'CENTRAL DELHI', lng: 77.21, lat: 28.64 },
  { name: 'DWARKA', lng: 77.04, lat: 28.58 },
  { name: 'GURUGRAM', lng: 77.08, lat: 28.47 },
  { name: 'NOIDA', lng: 77.33, lat: 28.56 },
  { name: 'YAMUNA', lng: 77.27, lat: 28.67 },
];

// Offline instant NCR landmarks for zero-network instantaneous search
const NCR_LOCAL_PLACES = [
  { name: 'Connaught Place, New Delhi', lat: 28.6315, lng: 77.2215 },
  { name: 'Janakpuri, West Delhi', lat: 28.6219, lng: 77.0740 },
  { name: 'CyberHub, DLF Cyber City, Gurugram', lat: 28.4950, lng: 77.0860 },
  { name: 'Dwarka Sector 21, New Delhi', lat: 28.5522, lng: 77.0582 },
  { name: 'Dhaula Kuan, South West Delhi', lat: 28.5890, lng: 77.1680 },
  { name: 'Mahipalpur, South West Delhi', lat: 28.5455, lng: 77.1360 },
  { name: 'Punjabi Bagh, West Delhi', lat: 28.6692, lng: 77.1317 },
  { name: 'IFFCO Chowk, Gurugram', lat: 28.4760, lng: 77.1420 },
  { name: 'Okhla Industrial Area, South Delhi', lat: 28.5410, lng: 77.2720 },
  { name: 'Mayapuri Industrial Area, West Delhi', lat: 28.6265, lng: 77.1380 },
  { name: 'Bawana Industrial Area, North Delhi', lat: 28.7580, lng: 77.1220 },
  { name: 'Noida Sector 18, Uttar Pradesh', lat: 28.5700, lng: 77.3200 },
  { name: 'Saket District Centre, South Delhi', lat: 28.5244, lng: 77.2167 },
  { name: 'Karol Bagh, Central Delhi', lat: 28.6514, lng: 77.1907 },
];

// Default known assignments fallback for standard nodes
const DEFAULT_NODE_DESTINATIONS = {
  P1: { destId: 'R2', destName: 'Mayapuri Hub', time: 17.0, dist: 10.0, path: ['P1', 'J3', 'R2'], weight: 12.0, waste: 'Batteries' },
  P2: { destId: 'R4', destName: 'Centre 28.59, 77.32', time: 50.0, dist: 31.2, path: ['P2', 'J4', 'J2', 'R1', 'R4'], weight: 16.0, waste: 'Computers' },
  P3: { destId: 'R1', destName: 'Okhla Plant', time: 34.0, dist: 22.0, path: ['P3', 'J2', 'R1'], weight: 12.0, waste: 'Smartphones' },
  P4: { destId: 'R3', destName: 'Bawana Plant', time: 28.0, dist: 19.0, path: ['P4', 'R3'], weight: 15.0, waste: 'Appliances' },
};

function getNodeKind(node) {
  if (!node) return 'junction';
  if (node.kind) return node.kind;
  if (node.type) return node.type;
  if (node.id && node.id.startsWith('P')) return 'pickup';
  if (node.id && node.id.startsWith('R')) return 'centre';
  return 'junction';
}

export function getCleanLandmarkName(node) {
  if (!node || !node.name) return node?.id || '';
  let name = String(node.name).trim();

  // If name has coordinates like "Pickup 28.68, 77.31" or "Centre 28.59, 77.32"
  if (name.includes(',') && (name.startsWith('Pickup') || name.startsWith('Centre'))) {
    const kind = getNodeKind(node);
    return kind === 'centre' ? `Centre ${node.id}` : `Pickup ${node.id}`;
  }

  // If name starts with "P1: ", "P1 - ", "P1 ", "R2: ", "J3: ", strip the ID prefix
  if (node.id) {
    const regex = new RegExp(`^${node.id}[:\\s\\-]+`, 'i');
    name = name.replace(regex, '').trim();
  }

  return name || node.id;
}

function buildNodeHoverHtml({
  node,
  metric = 'time',
  alloc = null,
  centreAllocations = [],
  centreCapacities = {},
}) {
  const isTime = metric === 'time';
  const unit = isTime ? 'min' : 'km';
  const nodeKind = getNodeKind(node);

  if (nodeKind === 'pickup') {
    const fallback = DEFAULT_NODE_DESTINATIONS[node.id] || {};
    const wasteType = node.waste_type || alloc?.waste_type || fallback.waste || 'Batteries';
    const weight = node.weight_kg != null ? node.weight_kg : (alloc?.weight_kg || fallback.weight || 12);
    const catColor = CATEGORY_COLORS[wasteType] || '#EA580C';

    const destId = alloc?.assigned_centre_id || fallback.destId || 'R2';
    const destName = alloc?.assigned_centre_name || fallback.destName || 'Mayapuri Hub';
    const timeMin = alloc?.total_time_min != null ? alloc.total_time_min : (fallback.time || 17.0);
    const distKm = alloc?.total_distance_km != null ? alloc.total_distance_km : (fallback.dist || 10.0);
    const costVal = isTime ? timeMin : distKm;
    const pathNodes = alloc?.path_nodes || fallback.path || [node.id, 'J3', destId];
    const pathStr = pathNodes.join(' → ');

    return `
      <div class="p-2.5 text-left font-sans text-slate-800" style="min-width: 250px; max-width: 290px;">
        <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${catColor};"></span>
            <span class="font-extrabold text-xs text-slate-900">${node.name.startsWith(node.id) ? node.name : `${node.id}: ${node.name}`}</span>
          </div>
          <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            Pickup
          </span>
        </div>

        <div class="space-y-1.5 text-xs">
          <!-- Waste Information & Target in 2 columns -->
          <div class="grid grid-cols-2 gap-1.5">
            <div class="bg-slate-50 p-2 rounded-lg border border-slate-200/80">
              <span class="text-[9px] uppercase font-bold text-slate-400 block">📦 Load</span>
              <div class="font-extrabold text-xs text-slate-900 mt-0.5">${weight} kg</div>
              <span class="text-[10px] font-semibold text-slate-600">${wasteType}</span>
            </div>
            <div class="bg-emerald-50/90 p-2 rounded-lg border border-emerald-200 text-emerald-950">
              <span class="text-[9px] uppercase font-bold text-emerald-800 block">🎯 Target</span>
              <div class="font-extrabold text-xs text-emerald-900 mt-0.5 truncate" title="${destName}">${destName}</div>
              <span class="text-[10px] font-mono text-emerald-700">${formatCost(costVal, unit)}</span>
            </div>
          </div>

          <!-- Transit Details -->
          <div class="bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200/80 flex items-center justify-between text-[10.5px]">
            <span class="text-slate-500 font-medium">Distance & Time:</span>
            <span class="font-bold text-slate-800">${distKm} km • ${timeMin} min</span>
          </div>

          <!-- Route Path -->
          <div class="text-[10px] text-slate-600 font-mono bg-white px-2 py-1 rounded border border-slate-200 flex items-center gap-1 truncate">
            <span class="text-emerald-700 font-sans font-bold shrink-0">Path:</span>
            <span class="truncate">${pathStr}</span>
          </div>
        </div>

        <div class="mt-1.5 text-[9.5px] text-emerald-700 font-semibold text-center bg-emerald-50/70 py-0.5 rounded border border-emerald-100 flex items-center justify-center gap-1">
          <span>🔍 Click pin to inspect algorithm steps</span>
        </div>
      </div>
    `;
  }

  if (nodeKind === 'centre') {
    const capObj = centreCapacities[node.id];
    let used = 0;
    let maxCap = node.max_capacity_kg || 25;
    if (typeof capObj === 'object' && capObj !== null) {
      used = capObj.used != null ? capObj.used : (capObj.max != null && capObj.remaining != null ? Math.max(0, capObj.max - capObj.remaining) : 0);
      if (capObj.max != null) maxCap = capObj.max;
    } else if (typeof capObj === 'number') {
      used = capObj;
    }

    const freeCap = Math.max(0, maxCap - used);
    const inbound = centreAllocations || [];
    let accepted = [];
    try {
      accepted = Array.isArray(node.accepted_types) ? node.accepted_types : JSON.parse(node.accepted_types || '[]');
    } catch (e) {
      accepted = ['Batteries', 'Smartphones'];
    }

    const pct = Math.min(100, Math.round((used / maxCap) * 100));

    return `
      <div class="p-2.5 text-left font-sans text-slate-800" style="min-width: 250px; max-width: 290px;">
        <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-emerald-600 shrink-0 flex items-center justify-center text-white text-[8px] font-bold">R</span>
            <span class="font-extrabold text-xs text-slate-900">${node.name.startsWith(node.id) ? node.name : `${node.id}: ${node.name}`}</span>
          </div>
          <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            Centre
          </span>
        </div>

        <div class="space-y-1.5 text-xs">
          <!-- Capacity Gauge -->
          <div class="bg-slate-50 p-2 rounded-lg border border-slate-200/80 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[9px] uppercase font-bold text-slate-400">Capacity</span>
              <span class="font-extrabold text-emerald-700 text-xs">${used} / ${maxCap} kg</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: ${pct}%;"></div>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-500 font-medium">
              <span>${pct}% used</span>
              <span class="text-emerald-700 font-bold">${freeCap} kg free</span>
            </div>
          </div>

          <!-- Accepted Categories -->
          <div class="p-1.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5">
            <span class="text-[9px] uppercase font-bold text-slate-400 block">Accepted Streams:</span>
            <div class="flex flex-wrap gap-1">
              ${accepted.map(t => `<span class="px-1 py-0.5 rounded text-[9.5px] font-medium bg-white border border-slate-200 text-slate-700">${t}</span>`).join('')}
            </div>
          </div>

          <!-- Inbound Pickups -->
          ${inbound.length > 0 ? `
            <div class="p-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200 text-emerald-950 space-y-0.5">
              <span class="text-[9px] uppercase font-bold text-emerald-800 block">Assigned Pickups:</span>
              <div class="text-[10px] font-semibold text-emerald-900">
                ${inbound.map(a => `${a.pickup_name} (${a.weight_kg}kg)`).join(', ')}
              </div>
            </div>
          ` : `
            <div class="text-[10px] text-slate-400 italic">No pickups currently assigned</div>
          `}
        </div>
      </div>
    `;
            <div class="text-[10.5px] text-slate-400 italic">No pickups currently assigned</div>
          `}
        </div>
      </div>
    `;
  }

  // Junction
  return `
    <div class="p-3 text-left font-sans text-slate-800" style="min-width: 240px; max-width: 280px;">
      <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full border border-slate-400 bg-slate-500 shrink-0"></span>
          <span class="font-extrabold text-sm text-slate-900">${node.name.startsWith(node.id) ? node.name : `${node.id}: ${node.name}`}</span>
        </div>
        <span class="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          Transit Junction
        </span>
      </div>
      <p class="text-xs text-slate-600 leading-snug">
        Arterial highway intersection facilitating multi-segment Dijkstra shortest path routing across Delhi NCR.
      </p>
    </div>
  `;
}

export default function MapCanvas({
  nodes = [],
  edges = [],
  activeStep = null,
  walkthroughStep = null,
  activePickupId = null,
  metric = 'time',
  centreCapacities = {},
  playbackSpeed = 1,
  previousPath = null,
  allocations = [],
  onSelectPickup = () => {},
  onMetricChange = () => {},
  onSelectEdge = () => {},
  onCreatePickup = () => {},
  onCreateCentre = () => {},
  onConnectNodes = () => {},
}) {
  const outerContainerRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Hover Tooltip Popup Reference
  const hoverPopupRef = useRef(null);

  // Vehicle Animation Marker
  const carMarkerRef = useRef(null);
  const carAnimFrameRef = useRef(null);

  // Markers references
  const nodeMarkersRef = useRef({});
  const midpointMarkersRef = useRef({});
  const watermarkMarkersRef = useRef([]);
  const searchPinMarkerRef = useRef(null);

  // Modes & Interaction
  const [mode, setMode] = useState('inspect'); // 'inspect' | 'add_pickup' | 'add_centre' | 'connect_road'
  const [connectSourceNode, setConnectSourceNode] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState('info'); // 'info' | 'success' | 'error'

  // Place Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const searchAbortControllerRef = useRef(null);

  // Config bar for + Pickup and + Centre
  const [newPickupCategory, setNewPickupCategory] = useState('Batteries');
  const [newPickupWeight, setNewPickupWeight] = useState(12);
  const [newCentreCapacity, setNewCentreCapacity] = useState(25);

  // Current Step resolution
  const step = walkthroughStep || activeStep || {};

  // Build node lookup map
  const nodesMap = useMemo(() => {
    const map = {};
    nodes.forEach((n) => {
      map[n.id] = n;
    });
    return map;
  }, [nodes]);

  // Dijkstra Step Entities
  const dijkstraDistances = step.distances || {};
  const currentPoppedNode = step.current_node;
  const visitedNodes = useMemo(() => new Set(step.visited_nodes || []), [step.visited_nodes]);
  const activeEdgeId = step.active_edge_id;
  const activeFromNode = step.from_node;
  const activeToNode = step.to_node;
  const activePathNodes = useMemo(() => step.path_nodes || step.active_path || [], [step]);
  const activePathEdges = useMemo(() => step.path_edges || step.active_edges || [], [step]);
  const candidateChecklist = step.candidate_checklist || step.checklist || [];

  // Active path node & edge sets
  const activePathNodesSet = useMemo(() => new Set(activePathNodes), [activePathNodes]);
  const activePathEdgesSet = useMemo(() => {
    const set = new Set(activePathEdges);
    if (set.size === 0 && activePathNodes.length > 1) {
      for (let i = 0; i < activePathNodes.length - 1; i++) {
        const u = activePathNodes[i];
        const v = activePathNodes[i + 1];
        const edge = edges.find(
          (e) => (e.source_id === u && e.target_id === v) || (e.source_id === v && e.target_id === u)
        );
        if (edge) set.add(edge.id);
      }
    }
    return set;
  }, [activePathEdges, activePathNodes, edges]);

  // Previous route set for old vs new comparison
  const previousPathEdgesSet = useMemo(() => {
    const set = new Set();
    if (previousPath && previousPath.length > 1) {
      for (let i = 0; i < previousPath.length - 1; i++) {
        const u = previousPath[i];
        const v = previousPath[i + 1];
        const edge = edges.find(
          (e) => (e.source_id === u && e.target_id === v) || (e.source_id === v && e.target_id === u)
        );
        if (edge) set.add(edge.id);
      }
    }
    return set;
  }, [previousPath, edges]);

  // Allocations mapping for immediate pickup and centre details
  const allocationsMap = useMemo(() => {
    const map = {};
    (allocations || []).forEach((a) => {
      map[a.pickup_id] = a;
    });
    return map;
  }, [allocations]);

  const centreAllocationsMap = useMemo(() => {
    const map = {};
    (allocations || []).forEach((a) => {
      if (a.assigned_centre_id) {
        if (!map[a.assigned_centre_id]) map[a.assigned_centre_id] = [];
        map[a.assigned_centre_id].push(a);
      }
    });
    return map;
  }, [allocations]);

  // Zero Stale Closures Refs
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const connectSourceNodeRef = useRef(connectSourceNode);
  connectSourceNodeRef.current = connectSourceNode;
  const onSelectEdgeRef = useRef(onSelectEdge);
  onSelectEdgeRef.current = onSelectEdge;
  const onCreatePickupRef = useRef(onCreatePickup);
  onCreatePickupRef.current = onCreatePickup;
  const onCreateCentreRef = useRef(onCreateCentre);
  onCreateCentreRef.current = onCreateCentre;
  const onConnectNodesRef = useRef(onConnectNodes);
  onConnectNodesRef.current = onConnectNodes;
  const onSelectPickupRef = useRef(onSelectPickup);
  onSelectPickupRef.current = onSelectPickup;
  const metricRef = useRef(metric);
  metricRef.current = metric;
  const centreCapacitiesRef = useRef(centreCapacities);
  centreCapacitiesRef.current = centreCapacities;
  const allocationsMapRef = useRef(allocationsMap);
  allocationsMapRef.current = allocationsMap;
  const centreAllocationsMapRef = useRef(centreAllocationsMap);
  centreAllocationsMapRef.current = centreAllocationsMap;
  const newPickupCategoryRef = useRef(newPickupCategory);
  newPickupCategoryRef.current = newPickupCategory;
  const newPickupWeightRef = useRef(newPickupWeight);
  newPickupWeightRef.current = newPickupWeight;
  const newCentreCapacityRef = useRef(newCentreCapacity);
  newCentreCapacityRef.current = newCentreCapacity;

  const showToast = useCallback((msg, type = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  // 1. Camera Auto-Fit Nodes Function
  const fitAllNodes = useCallback((map = mapRef.current, duration = 1000) => {
    const targetMap = map || mapRef.current;
    if (!targetMap) return;
    const currentNodes = nodesRef.current || [];
    const validNodes = currentNodes.filter((n) => n.lat != null && n.lng != null);
    if (validNodes.length === 0) return;

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    validNodes.forEach((n) => {
      const lng = Number(n.lng);
      const lat = Number(n.lat);
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });

    targetMap.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      {
        padding: { top: 140, bottom: 85, left: 75, right: 75 },
        maxZoom: 10.95,
        duration,
      }
    );
  }, []);

  // Auto-fit bounds when nodes are loaded from API
  const hasInitialFitRef = useRef(false);
  useEffect(() => {
    if (mapInstance && isMapLoaded && nodes.length > 0 && !hasInitialFitRef.current) {
      hasInitialFitRef.current = true;
      const timer = setTimeout(() => {
        fitAllNodes(mapInstance, 600);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [mapInstance, isMapLoaded, nodes.length, fitAllNodes]);

  // 2. Ensure Graph GeoJSON Source & Line Layers on Map
  const ensureGraphLayers = useCallback((map) => {
    if (!map) return;

    if (!map.getSource('graph-edges')) {
      map.addSource('graph-edges', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    // edges-casing: subtle crisp white casing directly below edges-base, #FFFFFF, line-opacity: 0.92
    if (!map.getLayer('edges-casing')) {
      map.addLayer({
        id: 'edges-casing',
        type: 'line',
        source: 'graph-edges',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': [
            'case',
            ['==', ['get', 'state'], 'route'],
            8.5,
            ['==', ['get', 'state'], 'active'],
            7.5,
            ['==', ['get', 'state'], 'spt'],
            6.5,
            5.5,
          ],
          'line-opacity': 0.92,
        },
      });
    }

    // edges-base: sharp medium slate #7C8EA6, line-width: 2.6, line-opacity: 0.85
    if (!map.getLayer('edges-base')) {
      map.addLayer({
        id: 'edges-base',
        type: 'line',
        source: 'graph-edges',
        filter: ['==', ['get', 'state'], 'base'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#7C8EA6',
          'line-width': 2.6,
          'line-opacity': 0.85,
        },
      });
    }

    // edges-spt: vivid sky #0EA5E9, line-width: 3.6
    if (!map.getLayer('edges-spt')) {
      map.addLayer({
        id: 'edges-spt',
        type: 'line',
        source: 'graph-edges',
        filter: ['==', ['get', 'state'], 'spt'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#0EA5E9',
          'line-width': 3.6,
          'line-opacity': 0.95,
        },
      });
    }

    // edges-active: glowing amber #F59E0B, line-width: 4.8
    if (!map.getLayer('edges-active')) {
      map.addLayer({
        id: 'edges-active',
        type: 'line',
        source: 'graph-edges',
        filter: ['==', ['get', 'state'], 'active'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#F59E0B',
          'line-width': 4.8,
          'line-opacity': 1.0,
        },
      });
    }

    // edges-route: rich emerald #059669, line-width: 5.4
    if (!map.getLayer('edges-route')) {
      map.addLayer({
        id: 'edges-route',
        type: 'line',
        source: 'graph-edges',
        filter: ['==', ['get', 'state'], 'route'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#059669',
          'line-width': 5.4,
          'line-opacity': 1.0,
        },
      });
    }

    // edges-blocked: rose #EF4444, line-width: 3.2, line-dasharray: [2, 2]
    if (!map.getLayer('edges-blocked')) {
      map.addLayer({
        id: 'edges-blocked',
        type: 'line',
        source: 'graph-edges',
        filter: ['==', ['get', 'state'], 'blocked'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#EF4444',
          'line-width': 3.2,
          'line-dasharray': [2, 2],
          'line-opacity': 0.9,
        },
      });
    }

    // edges-hit: transparent line-width: 22, line-opacity: 0.01 for reliable Inspect clicking
    if (!map.getLayer('edges-hit')) {
      map.addLayer({
        id: 'edges-hit',
        type: 'line',
        source: 'graph-edges',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#000000',
          'line-width': 22.0,
          'line-opacity': 0.01,
        },
      });
    }
  }, []);

  // 3. Update Graph GeoJSON Source with straight lines connecting nodes
  const updateGraphSource = useCallback(
    (map, currentEdges, currentNodes) => {
      if (!map) return;
      ensureGraphLayers(map);
      const source = map.getSource('graph-edges');
      if (!source) return;

      const nMap = {};
      currentNodes.forEach((n) => {
        nMap[n.id] = n;
      });

      const features = currentEdges
        .map((edge) => {
          const u = nMap[edge.source_id];
          const v = nMap[edge.target_id];
          if (!u || !v || u.lat == null || u.lng == null || v.lat == null || v.lng == null) {
            return null;
          }

          // State determination: blocked > route > active > spt > base
          let edgeState = 'base';
          if (edge.is_blocked) {
            edgeState = 'blocked';
          } else if (activePathEdgesSet.has(edge.id)) {
            edgeState = 'route';
          } else if (
            edge.id === activeEdgeId ||
            (activeFromNode === edge.source_id && activeToNode === edge.target_id) ||
            (activeFromNode === edge.target_id && activeToNode === edge.source_id)
          ) {
            edgeState = 'active';
          } else if (visitedNodes.has(edge.source_id) && visitedNodes.has(edge.target_id)) {
            edgeState = 'spt';
          } else if (previousPathEdgesSet.has(edge.id)) {
            edgeState = 'blocked';
          }

          return {
            type: 'Feature',
            properties: {
              id: edge.id,
              state: edgeState,
              base_distance_km: edge.base_distance_km,
              base_time_min: edge.base_time_min,
              is_blocked: edge.is_blocked ? 1 : 0,
              traffic_factor: edge.traffic_factor || 1.0,
            },
            geometry: {
              type: 'LineString',
              coordinates: [
                [Number(u.lng), Number(u.lat)],
                [Number(v.lng), Number(v.lat)],
              ],
            },
          };
        })
        .filter(Boolean);

      source.setData({
        type: 'FeatureCollection',
        features,
      });
    },
    [ensureGraphLayers, activePathEdgesSet, activeEdgeId, activeFromNode, activeToNode, visitedNodes, previousPathEdgesSet]
  );

  // 4. Initialize MapLibre GL Map (Await getMutedMapStyle() BEFORE constructor, NEVER call setStyle())
  useEffect(() => {
    let isCancelled = false;

    async function initMap() {
      if (!mapContainerRef.current || mapRef.current) return;

      try {
        const cleanedStyle = await getMutedMapStyle();
        if (isCancelled || !mapContainerRef.current) return;

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: cleanedStyle,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: 8,
          maxZoom: 18,
          pitch: 0,
          bearing: 0,
          dragRotate: false,
          pitchWithRotate: false,
          scrollZoom: false,
          attributionControl: false,
          pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
        });

        mapRef.current = map;

        map.on('load', () => {
          if (isCancelled) return;
          setIsMapLoaded(true);
          setMapInstance(map);

          ensureGraphLayers(map);
          updateGraphSource(map, edgesRef.current, nodesRef.current);
          fitAllNodes(map, 0);

          // Shared Node Hover Popup
          const popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 18,
            className: 'node-hover-popup',
            maxWidth: '300px',
          });
          hoverPopupRef.current = popup;
        });

        // Hover cursor effect on clickable road lines
        map.on('mousemove', 'edges-hit', () => {
          if (modeRef.current === 'inspect') {
            map.getCanvas().style.cursor = 'pointer';
          }
        });
        map.on('mouseleave', 'edges-hit', () => {
          map.getCanvas().style.cursor = '';
        });

        // Edge Click Handler (Inspect Mode)
        map.on('click', 'edges-hit', (e) => {
          if (modeRef.current === 'inspect') {
            const feature = e.features && e.features[0];
            if (feature && feature.properties) {
              const edgeId = feature.properties.id;
              const edge = edgesRef.current.find((ed) => ed.id === edgeId);
              if (edge) {
                onSelectEdgeRef.current(edge);
              }
            }
          }
        });

        // Map Click Handler for placing + Pickup or + Centre
        map.on('click', async (e) => {
          const currentMode = modeRef.current;
          if (currentMode === 'inspect' || currentMode === 'connect_road') return;

          const lng = e.lngLat.lng;
          const lat = e.lngLat.lat;
          const roundedLat = Math.round(lat * 10000) / 10000;
          const roundedLng = Math.round(lng * 10000) / 10000;

          if (currentMode === 'add_pickup') {
            try {
              const existingP = (nodesRef.current || []).filter(
                (n) => n.id && n.id.startsWith('P') && !isNaN(n.id.slice(1))
              );
              const nextPNum =
                existingP.length > 0
                  ? Math.max(...existingP.map((n) => parseInt(n.id.slice(1), 10))) + 1
                  : (nodesRef.current || []).length + 1;
              const defaultName = `Pickup P${nextPNum}`;
              const cat = newPickupCategoryRef.current;
              const wt = Number(newPickupWeightRef.current);
              await onCreatePickupRef.current({
                name: defaultName,
                lat: roundedLat,
                lng: roundedLng,
                waste_type: cat,
                weight_kg: wt,
              });
              showToastRef.current(`Placed new Pickup (${cat}, ${wt} kg)!`, 'success');
              setMode('inspect');
            } catch (err) {
              showToastRef.current(`Failed to create pickup: ${err.message}`, 'error');
            }
          } else if (currentMode === 'add_centre') {
            try {
              const existingR = (nodesRef.current || []).filter(
                (n) => n.id && n.id.startsWith('R') && !isNaN(n.id.slice(1))
              );
              const nextRNum =
                existingR.length > 0
                  ? Math.max(...existingR.map((n) => parseInt(n.id.slice(1), 10))) + 1
                  : (nodesRef.current || []).length + 1;
              const defaultName = `Centre R${nextRNum}`;
              const cap = Number(newCentreCapacityRef.current);
              await onCreateCentreRef.current({
                name: defaultName,
                lat: roundedLat,
                lng: roundedLng,
                max_capacity_kg: cap,
                accepted_types: ['Batteries', 'Smartphones', 'Computers', 'Appliances'],
              });
              showToastRef.current(`Placed new Recycling Centre (${cap} kg)!`, 'success');
              setMode('inspect');
            } catch (err) {
              showToastRef.current(`Failed to create centre: ${err.message}`, 'error');
            }
          }
        });
      } catch (err) {
        console.error('MapLibre initialization failure:', err);
      }
    }

    initMap();

    return () => {
      isCancelled = true;
      if (carAnimFrameRef.current) {
        cancelAnimationFrame(carAnimFrameRef.current);
      }
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
        hoverPopupRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Run ONCE on mount; clean up only on unmount (prevents map recreation blink loops)

  // Smooth two-finger touch / mousewheel pan handling
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      const map = mapRef.current;
      if (!map) return;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.003);
        const nextZoom = Math.min(18, Math.max(8, map.getZoom() * factor));
        map.setZoom(nextZoom);
      } else {
        e.preventDefault();
        map.panBy([e.deltaX, e.deltaY], { duration: 0 });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Sync Graph Source on edge or state changes
  useEffect(() => {
    if (mapInstance && isMapLoaded) {
      updateGraphSource(mapInstance, edges, nodes);
    }
  }, [mapInstance, isMapLoaded, edges, nodes, updateGraphSource]);

  // 5. Region Watermarks (North Delhi, Central Delhi, etc.)
  useEffect(() => {
    if (!mapInstance || !isMapLoaded) return;

    watermarkMarkersRef.current.forEach((m) => m.remove());
    watermarkMarkersRef.current = [];

    REGION_WATERMARKS.forEach((r) => {
      const el = document.createElement('div');
      el.className = 'region-watermark-pill select-none pointer-events-none';
      el.innerHTML = `
        <span class="text-[11px] font-extrabold uppercase tracking-widest text-slate-400/80 drop-shadow-xs">
          ${r.name}
        </span>
      `;

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        subpixelPositioning: false,
      })
        .setLngLat([r.lng, r.lat])
        .addTo(mapInstance);

      watermarkMarkersRef.current.push(marker);
    });
  }, [mapInstance, isMapLoaded]);

  // 6. Midpoint Edge Pills (Weights, Distance, Traffic) with z-index: 5
  useEffect(() => {
    if (!mapInstance || !isMapLoaded) return;

    const currentPills = midpointMarkersRef.current;
    const activeEdgeIds = new Set(edges.map((e) => e.id));

    // Remove stale pills
    Object.keys(currentPills).forEach((edgeId) => {
      if (!activeEdgeIds.has(edgeId)) {
        currentPills[edgeId].remove();
        delete currentPills[edgeId];
      }
    });

    edges.forEach((edge) => {
      const u = nodesMap[edge.source_id];
      const v = nodesMap[edge.target_id];
      if (!u || !v || u.lat == null || u.lng == null || v.lat == null || v.lng == null) return;

      const midLng = (Number(u.lng) + Number(v.lng)) / 2;
      const midLat = (Number(u.lat) + Number(v.lat)) / 2;

      const isBlocked = !!edge.is_blocked;
      const traffic = edge.traffic_factor || 1.0;
      const isRoute = activePathEdgesSet.has(edge.id);
      const isActiveRelaxation =
        edge.id === activeEdgeId ||
        (activeFromNode === edge.source_id && activeToNode === edge.target_id) ||
        (activeFromNode === edge.target_id && activeToNode === edge.source_id);

      // Cost value formatting
      let displayCost = '';
      if (isBlocked) {
        displayCost = '⛔ Blocked';
      } else if (metric === 'time') {
        const effectiveTime = edge.base_time_min * traffic;
        displayCost = formatCost(effectiveTime, 'min');
      } else {
        displayCost = formatCost(edge.base_distance_km, 'km');
      }

      if (traffic > 1.0 && !isBlocked) {
        displayCost += ` ${traffic}×`;
      }

      let marker = currentPills[edge.id];
      if (!marker) {
        const rootEl = document.createElement('div');
        rootEl.className = 'midpoint-pill-wrapper';
        rootEl.style.cursor = 'pointer';
        rootEl.style.zIndex = '5'; // Keep below node pins (z-index: 20)

        marker = new maplibregl.Marker({
          element: rootEl,
          anchor: 'center',
          subpixelPositioning: false,
        })
          .setLngLat([midLng, midLat])
          .addTo(mapInstance);

        currentPills[edge.id] = marker;
      } else {
        marker.setLngLat([midLng, midLat]);
        marker.getElement().style.zIndex = '5';
      }

      const pillEl = marker.getElement();
      pillEl.onclick = (e) => {
        e.stopPropagation();
        onSelectEdgeRef.current(edge);
      };

      let pillClass = 'bg-white text-slate-700 border-slate-300/80 shadow-xs hover:border-slate-400';
      if (isBlocked) {
        pillClass = 'bg-rose-50 border-rose-300 text-rose-700 font-bold';
      } else if (isRoute) {
        pillClass = 'bg-emerald-600 border-emerald-600 text-white font-bold shadow-sm';
      } else if (isActiveRelaxation) {
        pillClass = 'bg-amber-500 border-amber-500 text-white font-bold scale-110 shadow-sm ring-2 ring-amber-300/60';
      }

      pillEl.innerHTML = `
        <div class="px-1.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap shadow-xs border transition-all edge-cost-pill ${pillClass}" style="font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums;">
          ${displayCost}
        </div>
      `;
    });
  }, [
    mapInstance,
    isMapLoaded,
    edges,
    nodesMap,
    metric,
    activePathEdgesSet,
    activeEdgeId,
    activeFromNode,
    activeToNode,
  ]);

  // 7. Render Node Markers (Pickups, Centres, Junctions) with z-index: 20
  useEffect(() => {
    if (!mapInstance || !isMapLoaded) return;

    const currentMarkers = nodeMarkersRef.current;
    const activeNodeIds = new Set(nodes.map((n) => n.id));

    // Remove stale markers
    Object.keys(currentMarkers).forEach((id) => {
      if (!activeNodeIds.has(id)) {
        currentMarkers[id].remove();
        delete currentMarkers[id];
      }
    });

    nodes.forEach((node) => {
      if (node.lat == null || node.lng == null) return;

      const nodeKind = getNodeKind(node);
      const isPopped = currentPoppedNode === node.id;
      const isConnectSource = connectSourceNode && connectSourceNode.id === node.id;

      // Dijkstra Distance badge above node
      const dist = dijkstraDistances[node.id];
      const distBadge = dist != null ? formatCost(dist, metric === 'time' ? 'min' : 'km') : null;

      // Centre capacity & single Greedy Decision Badge (active during Greedy/Confirm steps)
      let centreSubLabel = '';
      let greedyBadge = '';
      const isGreedyOrConfirm =
        step.event_type === 'greedy_eval' ||
        step.event_type === 'route_confirm' ||
        candidateChecklist.length > 0;

      if (nodeKind === 'centre' && isGreedyOrConfirm) {
        const capObj = centreCapacities[node.id];
        let usedVal = 0;
        let maxCapVal = node.max_capacity_kg || 25;
        if (typeof capObj === 'object' && capObj !== null) {
          usedVal = capObj.used != null ? capObj.used : (capObj.max != null && capObj.remaining != null ? Math.max(0, capObj.max - capObj.remaining) : 0);
          if (capObj.max != null) maxCapVal = capObj.max;
        } else if (typeof capObj === 'number') {
          usedVal = capObj;
        }
        centreSubLabel = `${usedVal}/${maxCapVal} kg`;

        const check = candidateChecklist.find((c) => c.centre_id === node.id);
        if (check) {
          if (check.status === 'assigned' || check.assigned) {
            greedyBadge = `<span class="bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-xs">✅ Assigned</span>`;
          } else if (check.reason && check.reason.toLowerCase().includes('capacity')) {
            greedyBadge = `<span class="bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-xs">❌ Full</span>`;
          } else if (check.reason && check.reason.toLowerCase().includes('category')) {
            greedyBadge = `<span class="bg-amber-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-xs">⚠️ Wrong Category</span>`;
          } else if (check.reason && check.reason.toLowerCase().includes('blocked')) {
            greedyBadge = `<span class="bg-rose-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-xs">⛔ Blocked</span>`;
          }
        }
      }

      let marker = currentMarkers[node.id];
      if (!marker) {
        const rootEl = document.createElement('div');
        rootEl.className = 'node-marker-wrapper';
        rootEl.style.cursor = 'pointer';
        rootEl.style.zIndex = '20'; // Elevated above edge midpoint pills (z-index: 5)

        marker = new maplibregl.Marker({
          element: rootEl,
          anchor: 'center',
          subpixelPositioning: false,
        })
          .setLngLat([Number(node.lng), Number(node.lat)])
          .addTo(mapInstance);

        currentMarkers[node.id] = marker;
      } else {
        marker.setLngLat([Number(node.lng), Number(node.lat)]);
        marker.getElement().style.zIndex = isPopped ? '25' : '20';
      }

      const el = marker.getElement();

      // Node Hover Card Handler
      el.onmouseenter = () => {
        if (!mapInstance) return;
        if (!hoverPopupRef.current) {
          hoverPopupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 18,
            className: 'node-hover-popup',
            maxWidth: '300px',
          });
        }
        // If node is in northern half of map (lat > 28.58), open downwards so it never overflows top of screen
        const isUpperHalf = Number(node.lat) > 28.58;
        hoverPopupRef.current.options.anchor = isUpperHalf ? 'top' : 'bottom';
        hoverPopupRef.current.options.offset = isUpperHalf ? 16 : 22;

        const alloc = allocationsMapRef.current[node.id] || DEFAULT_NODE_DESTINATIONS[node.id];
        const centreAlloc = centreAllocationsMapRef.current[node.id] || [];
        const html = buildNodeHoverHtml({
          node,
          metric: metricRef.current,
          alloc,
          centreAllocations: centreAlloc,
          centreCapacities: centreCapacitiesRef.current || {},
        });
        hoverPopupRef.current
          .setLngLat([Number(node.lng), Number(node.lat)])
          .setHTML(html)
          .addTo(mapInstance);
      };

      el.onmouseleave = () => {
        if (hoverPopupRef.current) {
          hoverPopupRef.current.remove();
        }
      };

      // Node Click Handler
      el.onclick = (e) => {
        e.stopPropagation();
        const currentMode = modeRef.current;
        if (currentMode === 'connect_road') {
          if (!connectSourceNodeRef.current) {
            setConnectSourceNode(node);
            showToast(`Selected "${node.name}". Click second node to connect road.`, 'info');
          } else if (connectSourceNodeRef.current.id === node.id) {
            setConnectSourceNode(null);
            showToast('Deselected source node.', 'info');
          } else {
            onConnectNodesRef.current(connectSourceNodeRef.current.id, node.id);
            showToast(`Road connected between ${connectSourceNodeRef.current.name} and ${node.name}!`, 'success');
            setConnectSourceNode(null);
            setMode('inspect');
          }
        } else if (currentMode === 'inspect') {
          if (nodeKind === 'pickup' && onSelectPickupRef.current) {
            onSelectPickupRef.current(node.id);
          }
          showToast(`${node.name} (${nodeKind.toUpperCase()}) [${Number(node.lat).toFixed(4)}, ${Number(node.lng).toFixed(4)}]`, 'info');
        }
      };

      // Apple Maps studio-grade distinct Node Visuals with centered Node IDs
      let pinHtml = '';
      if (nodeKind === 'pickup') {
        const catColor = CATEGORY_COLORS[node.waste_type] || '#EA580C';
        pinHtml = `
          <div style="
            width: 32px;
            height: 32px;
            background-color: ${catColor};
            border: 2.5px solid #FFFFFF;
            border-radius: 9999px;
            box-shadow: 0 4px 12px rgba(15,23,42,0.18);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #FFFFFF;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: -0.5px;
            transition: transform 0.15s ease-out;
            transform: ${isPopped ? 'scale(1.2)' : 'scale(1)'};
          ">
            ${node.id}
          </div>
        `;
      } else if (nodeKind === 'centre') {
        pinHtml = `
          <div style="
            width: 34px;
            height: 34px;
            background-color: #059669;
            border: 2.5px solid #FFFFFF;
            border-radius: 9px;
            box-shadow: 0 4px 12px rgba(15,23,42,0.18);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #FFFFFF;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: -0.5px;
            transition: transform 0.15s ease-out;
            transform: ${isPopped ? 'scale(1.2)' : 'scale(1)'};
          ">
            ${node.id}
          </div>
        `;
      } else {
        // Junction: 24px white circle with 2.5px solid #475569 border and dark slate J1–J4 (10px font-bold) inside
        pinHtml = `
          <div style="
            width: 24px;
            height: 24px;
            background-color: #FFFFFF;
            border: 2.5px solid #475569;
            border-radius: 9999px;
            box-shadow: 0 2px 8px rgba(15,23,42,0.14);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #334155;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: -0.5px;
            transition: transform 0.15s ease-out;
            transform: ${isPopped ? 'scale(1.25)' : 'scale(1)'};
          ">
            ${node.id}
          </div>
        `;
      }

      // Single-line clean landmark name without dense metadata line
      const cleanLandmark = getCleanLandmarkName(node);

      el.innerHTML = `
        <div class="relative flex flex-col items-center select-none group">
          ${
            isPopped || isConnectSource
              ? `<div class="absolute -inset-2.5 rounded-full bg-amber-400/35 animate-pulse pointer-events-none"></div>`
              : ''
          }
          ${
            distBadge
              ? `<div class="mb-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-white text-slate-800 border border-slate-300 shadow-xs whitespace-nowrap dijkstra-badge" style="font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums;">${distBadge}</div>`
              : ''
          }
          ${pinHtml}
          <div class="mt-1 px-2 py-0.5 rounded-md bg-white border border-slate-200/90 shadow-sm whitespace-nowrap flex items-center gap-1.5 leading-tight">
            <span class="font-semibold text-[12px] text-[#0F172A]">${cleanLandmark}</span>
            ${centreSubLabel ? `<span class="text-[10px] font-mono font-medium text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200/60" style="font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums;">${centreSubLabel}</span>` : ''}
          </div>
          ${greedyBadge ? `<div class="mt-0.5 whitespace-nowrap">${greedyBadge}</div>` : ''}
        </div>
      `;
    });
  }, [
    mapInstance,
    isMapLoaded,
    nodes,
    allocationsMap,
    currentPoppedNode,
    dijkstraDistances,
    metric,
    centreCapacities,
    candidateChecklist,
    connectSourceNode,
    showToast,
  ]);

  // 8. Vehicle Icon along Active Route Segments
  const animateVehicle = useCallback(() => {
    if (!mapInstance || !isMapLoaded) return;
    if (activePathNodes.length < 2) return;

    const pathCoords = activePathNodes
      .map((id) => nodesMap[id])
      .filter((n) => n && n.lat != null && n.lng != null)
      .map((n) => [Number(n.lng), Number(n.lat)]);

    if (pathCoords.length < 2) return;

    let carMarker = carMarkerRef.current;
    if (!carMarker) {
      const carEl = document.createElement('div');
      carEl.className = 'vehicle-marker-wrapper';
      carEl.style.zIndex = '22';

      carEl.innerHTML = `
        <div id="eco-vehicle-badge" style="
          width: 34px;
          height: 34px;
          background-color: #10B981;
          border: 2px solid #FFFFFF;
          border-radius: 9999px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #FFFFFF;
          transition: transform 0.1s ease-out;
        ">
          <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"></path>
          </svg>
        </div>
      `;

      // Position between first two nodes
      const midPoint = [
        (pathCoords[0][0] + pathCoords[1][0]) / 2,
        (pathCoords[0][1] + pathCoords[1][1]) / 2,
      ];

      carMarker = new maplibregl.Marker({
        element: carEl,
        anchor: 'center',
        subpixelPositioning: false,
      })
        .setLngLat(midPoint)
        .addTo(mapInstance);

      carMarkerRef.current = carMarker;
    }

    if (carAnimFrameRef.current) {
      cancelAnimationFrame(carAnimFrameRef.current);
    }

    let segmentIdx = 0;
    let progress = 0;
    const speed = 0.012 * (playbackSpeed || 1);

    const stepDrive = () => {
      if (segmentIdx >= pathCoords.length - 1) {
        return;
      }

      const p1 = pathCoords[segmentIdx];
      const p2 = pathCoords[segmentIdx + 1];

      const currentLng = p1[0] + (p2[0] - p1[0]) * progress;
      const currentLat = p1[1] + (p2[1] - p1[1]) * progress;

      carMarker.setLngLat([currentLng, currentLat]);

      progress += speed;
      if (progress >= 1) {
        progress = 0;
        segmentIdx += 1;
      }

      carAnimFrameRef.current = requestAnimationFrame(stepDrive);
    };

    carAnimFrameRef.current = requestAnimationFrame(stepDrive);
  }, [mapInstance, isMapLoaded, activePathNodes, nodesMap, playbackSpeed]);

  // Trigger vehicle drive on route confirmation
  useEffect(() => {
    if (step.event_type === 'route_confirm' && activePathNodes.length >= 2) {
      animateVehicle();
    }
    return () => {
      if (carAnimFrameRef.current) {
        cancelAnimationFrame(carAnimFrameRef.current);
      }
    };
  }, [step.event_type, activePathNodes, animateVehicle]);

  // Clean up vehicle marker when route is cleared
  useEffect(() => {
    if (activePathNodes.length === 0 && carMarkerRef.current) {
      carMarkerRef.current.remove();
      carMarkerRef.current = null;
    }
  }, [activePathNodes]);

  // 9. Instant Local Search + External Photon Geocoder (0 forbidden URLs)
  const handleSearchQueryChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      setSearchDropdownOpen(false);
      return;
    }

    const lower = query.toLowerCase();
    // 1. Instant local match
    const localMatches = NCR_LOCAL_PLACES.filter((p) => p.name.toLowerCase().includes(lower));
    setSearchResults(localMatches);
    setSearchDropdownOpen(true);

    // 2. Photon geocoder fallback for query completion (open geocoder)
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;

    setIsSearching(true);
    fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=28.61&lon=77.20&limit=5`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        const fetched = (data.features || []).map((f) => ({
          name: [f.properties.name, f.properties.city, f.properties.state].filter(Boolean).join(', '),
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        }));

        // Merge local matches with fetched
        const combined = [...localMatches];
        fetched.forEach((f) => {
          if (!combined.some((c) => Math.abs(c.lat - f.lat) < 0.005 && Math.abs(c.lng - f.lng) < 0.005)) {
            combined.push(f);
          }
        });
        setSearchResults(combined.slice(0, 6));
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          // Keep local matches
        }
      })
      .finally(() => {
        setIsSearching(false);
      });
  };

  const handleSelectSearchResult = (place) => {
    setSelectedPlace(place);
    setSearchQuery(place.name);
    setSearchDropdownOpen(false);

    if (mapInstance) {
      mapInstance.flyTo({
        center: [Number(place.lng), Number(place.lat)],
        zoom: 13,
        duration: 1200,
      });

      if (searchPinMarkerRef.current) {
        searchPinMarkerRef.current.remove();
      }
      const pinEl = document.createElement('div');
      pinEl.className = 'search-pin-wrapper';
      pinEl.innerHTML = `
        <div class="px-2 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-1">
          <span>📍</span>
          <span>${place.name.split(',')[0]}</span>
        </div>
      `;
      const marker = new maplibregl.Marker({
        element: pinEl,
        anchor: 'bottom',
        subpixelPositioning: false,
      })
        .setLngLat([Number(place.lng), Number(place.lat)])
        .addTo(mapInstance);
      searchPinMarkerRef.current = marker;
    }
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const next = !prev;
      const container = outerContainerRef.current;
      if (next) {
        if (container && container.requestFullscreen) {
          try {
            container.requestFullscreen().catch(() => {});
          } catch (e) {}
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          try {
            document.exitFullscreen().catch(() => {});
          } catch (e) {}
        }
      }
      return next;
    });
  };

  // Sync fullscreen change with native browser events and resize MapLibre
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (mapRef.current) {
        setTimeout(() => {
          mapRef.current.resize();
          fitAllNodes(mapRef.current, 350);
        }, 150);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [fitAllNodes]);

  // Handle CSS fallback fullscreen resize
  useEffect(() => {
    if (mapRef.current) {
      const timer = setTimeout(() => {
        mapRef.current.resize();
        fitAllNodes(mapRef.current, 350);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen, fitAllNodes]);

  // Escape key listener to exit fallback fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement && document.exitFullscreen) {
          try {
            document.exitFullscreen().catch(() => {});
          } catch (err) {}
        }
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleToggle3D = () => {
    if (!mapInstance) return;
    const next3D = !is3D;
    setIs3D(next3D);
    mapInstance.easeTo({
      pitch: next3D ? 45 : 0,
      bearing: next3D ? -15 : 0,
      duration: 800,
    });
  };

  return (
    <div
      ref={outerContainerRef}
      style={
        isFullscreen
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 9999,
            }
          : {}
      }
      className={`w-full h-full bg-[#F5F7FA] overflow-hidden flex flex-col transition-all duration-150 ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] w-screen h-screen rounded-none border-none shadow-none m-0 p-0'
          : 'relative rounded-2xl border border-slate-200/90 shadow-sm'
      }`}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`absolute top-16 left-1/2 -translate-x-1/2 z-30 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-lg flex items-center gap-2 backdrop-blur-md animate-in fade-in transition-all ${
            toastType === 'success'
              ? 'bg-emerald-900/90 text-white border border-emerald-500'
              : toastType === 'error'
              ? 'bg-rose-900/90 text-white border border-rose-500'
              : 'bg-slate-900/90 text-white border border-slate-700'
          }`}
        >
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-1 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Toolbar at Top of Map */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 p-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm text-xs select-none">
        {/* Left: Search Box */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 focus-within:border-emerald-500 focus-within:bg-white transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchQueryChange}
              onFocus={() => {
                if (searchResults.length > 0) setSearchDropdownOpen(true);
              }}
              placeholder="Search city, sector, or landmark..."
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchDropdownOpen(false);
                  if (searchPinMarkerRef.current) {
                    searchPinMarkerRef.current.remove();
                    searchPinMarkerRef.current = null;
                  }
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Search Dropdown */}
          {searchDropdownOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl bg-white border border-slate-200 shadow-xl z-30 py-1">
              {searchResults.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center: Travel Time / Distance Metric Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => onMetricChange('time')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              metric === 'time'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>⏱️ Travel Time (min)</span>
          </button>
          <button
            type="button"
            onClick={() => onMetricChange('distance')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
              metric === 'distance'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🛣️ Distance (km)</span>
          </button>
        </div>

        {/* Right: Mode Buttons (Inspect, Pickup, Centre, Connect Road, Fullscreen) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setMode('inspect');
              setConnectSourceNode(null);
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              mode === 'inspect'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Inspect</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('add_pickup');
              setConnectSourceNode(null);
              showToast('Click anywhere on the map to place a pickup!', 'info');
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              mode === 'add_pickup'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Pickup</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('add_centre');
              setConnectSourceNode(null);
              showToast('Click anywhere on the map to place a recycling centre!', 'info');
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              mode === 'add_centre'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Centre</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('connect_road');
              setConnectSourceNode(null);
              showToast('Click 1st node to begin straight road connection.', 'info');
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
              mode === 'connect_road'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Connect Road</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />

          <button
            type="button"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen Canvas'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen Canvas'}
            className={`p-1.5 rounded-lg transition-colors ${
              isFullscreen ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Sub-bar hint when in creation modes */}
      {mode !== 'inspect' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-300 shadow-md text-xs">
          {mode === 'add_pickup' && (
            <>
              <span className="font-bold text-amber-700">Drop Pickup:</span>
              <select
                value={newPickupCategory}
                onChange={(e) => setNewPickupCategory(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-700"
              >
                {Object.keys(CATEGORY_COLORS).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                max="100"
                value={newPickupWeight}
                onChange={(e) => setNewPickupWeight(e.target.value)}
                className="w-14 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-xs text-center font-semibold text-slate-700"
              />
              <span className="text-slate-500">kg</span>
              <span className="text-slate-400 text-[11px]">(Click map to place)</span>
            </>
          )}

          {mode === 'add_centre' && (
            <>
              <span className="font-bold text-emerald-700">Drop Centre:</span>
              <span className="text-slate-600">Capacity:</span>
              <input
                type="number"
                min="10"
                max="200"
                value={newCentreCapacity}
                onChange={(e) => setNewCentreCapacity(e.target.value)}
                className="w-14 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-xs text-center font-semibold text-slate-700"
              />
              <span className="text-slate-500">kg</span>
              <span className="text-slate-400 text-[11px]">(Click map to place)</span>
            </>
          )}

          {mode === 'connect_road' && (
            <span className="font-bold text-indigo-700">
              {connectSourceNode
                ? `From "${connectSourceNode.name}" → Click 2nd node`
                : 'Click 1st node to connect straight road'}
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setMode('inspect');
              setConnectSourceNode(null);
            }}
            className="ml-2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main MapLibre Map Canvas Container */}
      <div ref={mapContainerRef} className="w-full flex-1 h-full min-h-[500px]" />

      {/* Bottom Right Floating Controls */}
      <div className="absolute bottom-8 right-4 z-20 flex flex-col items-center gap-1.5 p-1 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-md">
        <button
          type="button"
          onClick={() => {
            if (mapInstance) mapInstance.zoomIn({ duration: 300 });
          }}
          title="Zoom In"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold text-sm transition-colors"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            if (mapInstance) mapInstance.zoomOut({ duration: 300 });
          }}
          title="Zoom Out"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold text-sm transition-colors"
        >
          −
        </button>
        <div className="w-5 h-[1px] bg-slate-200 my-0.5" />
        <button
          type="button"
          onClick={() => fitAllNodes(mapInstance, 800)}
          title="Auto-Fit Delhi NCR Nodes"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <Compass className="w-4 h-4 text-emerald-600" />
        </button>
        <button
          type="button"
          onClick={handleToggle3D}
          title="Toggle 3D View"
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-extrabold transition-colors ${
            is3D ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          3D
        </button>
      </div>

      {/* Replay Vehicle Drive Button (when route is confirmed) */}
      {activePathNodes.length >= 2 && (
        <div className="absolute bottom-8 left-4 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={animateVehicle}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/90 text-white text-xs font-semibold shadow-md hover:bg-slate-800 backdrop-blur-md transition-all"
          >
            <Play className="w-3.5 h-3.5 text-lime-400 fill-lime-400" />
            <span>Drive Route</span>
          </button>
        </div>
      )}

      {/* Clean Attribution Pill */}
      <div className="absolute bottom-2 right-4 z-10 px-2 py-0.5 rounded-full bg-white/70 backdrop-blur-xs text-[9.5px] text-slate-500 font-medium">
        MapLibre • OpenFreeMap
      </div>
    </div>
  );
}
