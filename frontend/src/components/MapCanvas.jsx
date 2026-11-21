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
  X,
  Share2,
  Clock,
  Route,
  Check,
} from 'lucide-react';
import { getMutedMapStyle } from '../utils/mapStyle';
import {
  unlockAudio,
  playNodeTick,
  playCarIgnition,
  startCarIdle,
  stopCarIdle,
  startCarHum,
  stopCarHum,
  playCarBrake,
  playArrivalChime,
  playCarBrakeAndArrive,
  playEngineStop,
  stopAllSounds,
} from '../utils/soundEngine';

export const ALL_STREAMS = ['Batteries', 'Computers', 'Smartphones', 'Appliances'];

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

/**
 * Format cost values cleanly:
 * Strips trailing .0 (e.g. 8m, 26m, 14km) while keeping non-integer decimals (e.g. 8.5km).
 */
export function formatCost(val, unit = '') {
  if (val == null || !Number.isFinite(Number(val)) || Number(val) >= 9000) {
    return '∞';
  }
  const num = Number(val);
  const rounded = Math.round(num * 10) / 10;
  const formatted = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  return unit ? `${formatted}${unit}` : formatted;
}

/**
 * Straight Graph Edge Segment Generator
 * Pure helper returning the exact straight 2-point segment [u, v].
 */
export function getEdgePolyline(edge, uNode, vNode) {
  if (!uNode || !vNode || uNode.lng == null || uNode.lat == null || vNode.lng == null || vNode.lat == null) {
    return [];
  }
  return [
    [Number(uNode.lng), Number(uNode.lat)],
    [Number(vNode.lng), Number(vNode.lat)],
  ];
}

/**
 * Arc-Length Slicer for Buttery-Smooth Steering
 * Measures cumulative aspect-corrected segment lengths (dx * cos(lat), dy).
 */
export function slicePolylineByProgress(coords, progress) {
  if (!coords || coords.length === 0) {
    return { partialCoords: [], tipCoord: [0, 0], angleDeg: 0, bearingDeg: 0 };
  }
  if (coords.length === 1) {
    return { partialCoords: [coords[0], coords[0]], tipCoord: coords[0], angleDeg: 0, bearingDeg: 0 };
  }

  // Measure cumulative aspect-corrected segment lengths
  const segLengths = [];
  const cumLengths = [0];
  let totalLength = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const midLatRad = ((p1[1] + p2[1]) / 2) * (Math.PI / 180);
    const dx = (p2[0] - p1[0]) * Math.cos(midLatRad);
    const dy = p2[1] - p1[1];
    const d = Math.hypot(dx, dy);
    segLengths.push(d);
    totalLength += d;
    cumLengths.push(totalLength);
  }

  const p0 = coords[0];
  const p1 = coords[1];
  const initialLatRad = ((p0[1] + p1[1]) / 2) * (Math.PI / 180);
  const initialDx = (p1[0] - p0[0]) * Math.cos(initialLatRad);
  const initialDy = p1[1] - p0[1];
  const initialAngle = -Math.atan2(initialDy, initialDx) * (180 / Math.PI);
  const initialBearing = Math.atan2(initialDx, initialDy) * (180 / Math.PI);

  if (totalLength < 1e-9) {
    return { partialCoords: [coords[0], coords[0]], tipCoord: coords[0], angleDeg: initialAngle, bearingDeg: initialBearing };
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));

  if (clampedProgress <= 0) {
    return {
      partialCoords: [coords[0], coords[0]],
      tipCoord: coords[0],
      angleDeg: initialAngle,
      bearingDeg: initialBearing,
    };
  }

  if (clampedProgress >= 1) {
    const pPrev = coords[coords.length - 2];
    const pNext = coords[coords.length - 1];
    const finalLatRad = ((pPrev[1] + pNext[1]) / 2) * (Math.PI / 180);
    const finalDx = (pNext[0] - pPrev[0]) * Math.cos(finalLatRad);
    const finalDy = pNext[1] - pPrev[1];
    const finalAngle = -Math.atan2(finalDy, finalDx) * (180 / Math.PI);
    const finalBearing = Math.atan2(finalDx, finalDy) * (180 / Math.PI);
    return {
      partialCoords: coords.slice(),
      tipCoord: pNext,
      angleDeg: finalAngle,
      bearingDeg: finalBearing,
    };
  }

  const targetDist = clampedProgress * totalLength;

  let segIdx = 0;
  for (let i = 0; i < segLengths.length; i++) {
    if (targetDist <= cumLengths[i + 1] || i === segLengths.length - 1) {
      segIdx = i;
      break;
    }
  }

  const segDist = segLengths[segIdx];
  const distIntoSeg = targetDist - cumLengths[segIdx];
  const t = segDist > 0 ? Math.max(0, Math.min(1, distIntoSeg / segDist)) : 0;

  const pPrev = coords[segIdx];
  const pNext = coords[segIdx + 1];

  const curLng = pPrev[0] + (pNext[0] - pPrev[0]) * t;
  const curLat = pPrev[1] + (pNext[1] - pPrev[1]) * t;
  const tipCoord = [curLng, curLat];

  const midLatRad = ((pPrev[1] + pNext[1]) / 2) * (Math.PI / 180);
  const segDx = (pNext[0] - pPrev[0]) * Math.cos(midLatRad);
  const segDy = pNext[1] - pPrev[1];
  const angleDeg = -Math.atan2(segDy, segDx) * (180 / Math.PI);
  const bearingDeg = Math.atan2(segDx, segDy) * (180 / Math.PI);

  const partialCoords = coords.slice(0, segIdx + 1);
  partialCoords.push(tipCoord);
  if (partialCoords.length < 2) {
    partialCoords.push(tipCoord);
  }

  return {
    partialCoords,
    tipCoord,
    angleDeg,
    bearingDeg,
  };
}

const DEFAULT_CENTER = [77.16, 28.61];
const DEFAULT_ZOOM = 10.7;

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
  P2: { destId: 'R4', destName: 'Mayapuri Hub', time: 50.0, dist: 31.2, path: ['P2', 'J4', 'J2', 'R1'], weight: 16.0, waste: 'Computers' },
  P3: { destId: 'R1', destName: 'Okhla Plant', time: 34.0, dist: 22.0, path: ['P3', 'J2', 'R1'], weight: 15.0, waste: 'Smartphones' },
  P4: { destId: 'R3', destName: 'Bawana Plant', time: 28.0, dist: 19.0, path: ['P4', 'R3'], weight: 15.0, waste: 'Appliances' },
};

export function isMapReady(map) {
  if (!map) return false;
  try {
    if (typeof map.getStyle === 'function') {
      return Boolean(map.getStyle());
    }
    return Boolean(map.isStyleLoaded && map.isStyleLoaded());
  } catch (e) {
    return false;
  }
}

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

/**
 * Return single-line label format matching Option 2 reference:
 * e.g. "P1 Janakpuri", "R2 Mayapuri Hub", "J3 Punjabi Bagh", "P3 Dwarka Sec 21", "R1 Okhla Plant"
 */
export function getNodeDisplayLabel(node) {
  if (!node) return '';
  const clean = getCleanLandmarkName(node);
  if (clean === node.id) return node.id;
  if (/^Pickup\s+P\d+/i.test(clean)) {
    return `${node.id} Pickup`;
  }
  if (/^Centre\s+R\d+/i.test(clean)) {
    return `${node.id} Centre`;
  }
  if (clean.toLowerCase().startsWith(node.id.toLowerCase())) {
    return clean;
  }
  return `${node.id} ${clean}`;
}

// Lucide Recycle SVG markup for Recycling Centre markers
const RECYCLE_SVG_12PX = `
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
    <path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"></path>
    <path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"></path>
    <path d="m14 16-3 3 3 3"></path>
    <path d="M8.293 13.596 7.196 9.5 3.1 10.598"></path>
    <path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"></path>
    <path d="m13.378 9.633 4.096 1.098 1.097-4.096"></path>
  </svg>
`;

const RECYCLE_SVG_12PX_WHITE = `
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
    <path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"></path>
    <path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"></path>
    <path d="m14 16-3 3 3 3"></path>
    <path d="M8.293 13.596 7.196 9.5 3.1 10.598"></path>
    <path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"></path>
    <path d="m13.378 9.633 4.096 1.098 1.097-4.096"></path>
  </svg>
`;

// High-DPI Vector Status Icons (Crisp Lucide-style SVG micro-icons with specular depth)
const STATUS_ICONS = {
  assigned: `
    <svg width="10.5" height="10.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: block; overflow: visible; shrink: 0; filter: drop-shadow(0 0.5px 1px rgba(0,0,0,0.25));">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `,
  capacity_full: `
    <svg width="10.5" height="10.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display: block; overflow: visible; shrink: 0; filter: drop-shadow(0 0.5px 1px rgba(0,0,0,0.25));">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
    </svg>
  `,
  wrong_category: `
    <svg width="10.5" height="10.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display: block; overflow: visible; shrink: 0; filter: drop-shadow(0 0.5px 1px rgba(0,0,0,0.25));">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  `,
  blocked: `
    <svg width="10.5" height="10.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display: block; overflow: visible; shrink: 0; filter: drop-shadow(0 0.5px 1px rgba(0,0,0,0.25));">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
  `,
};

export function renderStatusBadge(type, label) {
  let bgGradient = '';
  let shadow = '';
  let iconSvg = '';

  if (type === 'assigned') {
    bgGradient = 'linear-gradient(180deg, #10B981 0%, #059669 100%)';
    shadow = '0 2px 6px -1px rgba(5, 150, 105, 0.5), 0 1px 2px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.35)';
    iconSvg = STATUS_ICONS.assigned;
  } else if (type === 'capacity_full') {
    bgGradient = 'linear-gradient(180deg, #F43F5E 0%, #E11D48 100%)';
    shadow = '0 2px 6px -1px rgba(225, 29, 72, 0.5), 0 1px 2px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.35)';
    iconSvg = STATUS_ICONS.capacity_full;
  } else if (type === 'wrong_category') {
    bgGradient = 'linear-gradient(180deg, #F59E0B 0%, #D97706 100%)';
    shadow = '0 2px 6px -1px rgba(217, 119, 6, 0.5), 0 1px 2px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.35)';
    iconSvg = STATUS_ICONS.wrong_category;
  } else {
    bgGradient = 'linear-gradient(180deg, #EF4444 0%, #DC2626 100%)';
    shadow = '0 2px 6px -1px rgba(220, 38, 38, 0.5), 0 1px 2px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.35)';
    iconSvg = STATUS_ICONS.blocked;
  }

  return `
    <div class="eco-status-badge mt-1 pointer-events-none select-none">
      <div class="eco-status-pill" style="
        display: inline-flex;
        align-items: center;
        gap: 3.5px;
        padding: 2.5px 7px 2.5px 5.5px;
        border-radius: 9999px;
        background: ${bgGradient};
        border: 1px solid rgba(255, 255, 255, 0.35);
        box-shadow: ${shadow};
        color: #FFFFFF;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: 0.015em;
        -webkit-font-smoothing: antialiased;
        text-shadow: 0 1px 1.5px rgba(0, 0, 0, 0.28);
        white-space: nowrap;
      ">
        ${iconSvg}
        <span>${label}</span>
      </div>
    </div>
  `;
}

// Iconic Mr. Bean Lime-Green Mini Cooper with Matte-Black Hood SVG + Dynamic Reactive Lighting + 2.5D Depth
const MR_BEAN_MINI_COOPER_HTML = `
  <div id="eco-mr-bean-mini" style="
    width: 76px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: none !important;
    will-change: transform;
    pointer-events: none;
    overflow: visible;
  ">
    <svg width="76" height="40" viewBox="-20 -10 76 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; overflow: visible; pointer-events: none;">
      <defs>
        <!-- Soft Ground Drop-Shadow Blur Filter for 2.5D Pitched Depth -->
        <filter id="mini-ground-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>

        <!-- Front Headlight Beams: Warm-yellow (#FEF08A -> transparent) projecting ~24px forward -->
        <linearGradient id="mini-headlight-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#FEF08A" stop-opacity="0.88" />
          <stop offset="28%" stop-color="#FEF08A" stop-opacity="0.55" />
          <stop offset="68%" stop-color="#FEF08A" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#FEF08A" stop-opacity="0" />
        </linearGradient>

        <!-- Rear Brake Light Soft Outer Blooms -->
        <radialGradient id="mini-brake-bloom-top" cx="2.2" cy="5.2" r="7" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#EF4444" stop-opacity="0.88" />
          <stop offset="50%" stop-color="#EF4444" stop-opacity="0.38" />
          <stop offset="100%" stop-color="#EF4444" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="mini-brake-bloom-bot" cx="2.2" cy="14.8" r="7" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#EF4444" stop-opacity="0.88" />
          <stop offset="50%" stop-color="#EF4444" stop-opacity="0.38" />
          <stop offset="100%" stop-color="#EF4444" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- 2.5D Soft Offset Ground Drop-Shadow beneath the chassis -->
      <ellipse cx="17.5" cy="11.8" rx="17" ry="9.5" fill="rgba(15, 23, 42, 0.32)" filter="url(#mini-ground-shadow)" />

      <!-- Front Headlight Beams (Dynamic: 2 soft warm-yellow light cones projecting ~24px forward) -->
      <g class="car-headlights" style="opacity: 0; pointer-events: none;">
        <!-- Upper cone (from cx=32, cy=5 projecting ~24px to x=56) -->
        <polygon points="32,4.2 56,0.2 56,9.8 32,5.8" fill="url(#mini-headlight-grad)" />
        <!-- Lower cone (from cx=32, cy=15 projecting ~24px to x=56) -->
        <polygon points="32,14.2 56,10.2 56,19.8 32,15.8" fill="url(#mini-headlight-grad)" />
        <!-- High-intensity illuminated bulb cores -->
        <circle cx="32" cy="5" r="1.6" fill="#FFFFFF" />
        <circle cx="32" cy="15" r="1.6" fill="#FFFFFF" />
      </g>

      <!-- Rear Brake Lights (Dynamic: crisp glowing crimson taillights with soft red outer bloom) -->
      <g class="car-brakelights" style="opacity: 0; pointer-events: none;">
        <!-- Soft red outer blooms -->
        <circle cx="2.2" cy="5.2" r="7" fill="url(#mini-brake-bloom-top)" />
        <circle cx="2.2" cy="14.8" r="7" fill="url(#mini-brake-bloom-bot)" />
        <!-- Crisp glowing crimson taillights -->
        <rect x="1.5" y="3.8" width="1.8" height="2.8" rx="0.7" fill="#EF4444" stroke="#FCA5A5" stroke-width="0.5" />
        <rect x="1.5" y="13.4" width="1.8" height="2.8" rx="0.7" fill="#EF4444" stroke="#FCA5A5" stroke-width="0.5" />
      </g>

      <!-- 3-Circle Exhaust Puffs behind rear tailpipe -->
      <g class="car-exhaust-group" style="pointer-events: none;">
        <circle class="exhaust-puff puff-1" cx="0.5" cy="14" r="1.6" fill="rgba(148,163,184,0.55)" />
        <circle class="exhaust-puff puff-2" cx="-3" cy="13.5" r="2.2" fill="rgba(148,163,184,0.45)" />
        <circle class="exhaust-puff puff-3" cx="-6.8" cy="13" r="3" fill="rgba(148,163,184,0.35)" />
      </g>

      <!-- Car Rumble Group (subject to engine-rumble during Phase 1 & 3) -->
      <g class="car-rumble-group" style="transform-origin: 18px 10px;">
        <!-- 4 Compact Black Wheels -->
        <rect x="5" y="0.5" width="6.5" height="2.5" rx="1.2" fill="#0F172A" />
        <rect x="5" y="17" width="6.5" height="2.5" rx="1.2" fill="#0F172A" />
        <rect x="23" y="0.5" width="6.5" height="2.5" rx="1.2" fill="#0F172A" />
        <rect x="23" y="17" width="6.5" height="2.5" rx="1.2" fill="#0F172A" />

        <!-- Side Mirrors -->
        <rect x="20.5" y="0" width="1.8" height="1.8" rx="0.9" fill="#1E293B" />
        <rect x="20.5" y="18.2" width="1.8" height="1.8" rx="0.9" fill="#1E293B" />

        <!-- Main Boxy Mini Cooper Body (Lime Green with subtle #4D7C0F outline) -->
        <rect x="2.5" y="2" width="31" height="16" rx="3.5" fill="#84CC16" stroke="#4D7C0F" stroke-width="1.2" />

        <!-- 2.5D Body Contour Shading (Top highlight line & bottom sill shadow line) -->
        <line x1="6" y1="2.7" x2="22" y2="2.7" stroke="#D9F99D" stroke-width="0.8" stroke-linecap="round" opacity="0.9" />
        <line x1="6" y1="17.3" x2="22" y2="17.3" stroke="#365314" stroke-width="0.8" stroke-linecap="round" opacity="0.65" />

        <!-- Signature Matte-Black Hood (#1E293B) with subtle bevel -->
        <path d="M 23 2.5 H 29.5 Q 33 2.5 33 6 V 14 Q 33 17.5 29.5 17.5 H 23 Z" fill="#1E293B" />
        <path d="M 24 3.5 H 28.5 Q 31 3.5 31 5.8 V 7.2 H 24 Z" fill="#334155" opacity="0.65" />

        <!-- Wraparound Front Windshield (#0F172A) -->
        <path d="M 20.5 3.5 Q 22.5 10 20.5 16.5 L 18.5 16.5 Q 20.5 10 18.5 3.5 Z" fill="#0F172A" />

        <!-- Lime Green Roof (#A3E635) with 2.5D soft specular highlight -->
        <rect x="8" y="4" width="10.5" height="12" rx="1.5" fill="#A3E635" />
        <rect x="8.6" y="4.6" width="9.3" height="4.2" rx="1" fill="#D9F99D" opacity="0.45" />

        <!-- Rear Windshield (#0F172A) -->
        <rect x="5.5" y="4.5" width="2" height="11" rx="1" fill="#0F172A" />

        <!-- Round White/Pale Yellow Headlights (#FEF9C3) -->
        <circle cx="32" cy="5" r="1.3" fill="#FEF9C3" stroke="#CBD5E1" stroke-width="0.5" />
        <circle cx="32" cy="15" r="1.3" fill="#FEF9C3" stroke="#CBD5E1" stroke-width="0.5" />

        <!-- Taillights -->
        <rect x="2.2" y="4.2" width="1" height="2" rx="0.5" fill="#EF4444" />
        <rect x="2.2" y="13.8" width="1" height="2" rx="0.5" fill="#EF4444" />
      </g>
    </svg>
  </div>
`;

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
      <div class="p-2.5 text-left font-sans text-slate-800 pointer-events-none select-none" style="min-width: 250px; max-width: 290px; pointer-events: none; user-select: none;">
        <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${catColor};"></span>
            <span class="font-extrabold text-xs text-slate-900">${getNodeDisplayLabel(node)}</span>
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
              <span class="text-[10px] font-mono text-emerald-700">${formatCost(costVal, ` ${unit}`)}</span>
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
          <span>🔍 Click node to inspect algorithm steps</span>
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
      accepted = ['Batteries', 'Smartphones', 'Computers', 'Appliances'];
    }

    const pct = Math.min(100, Math.round((used / maxCap) * 100));

    return `
      <div class="p-2.5 text-left font-sans text-slate-800 pointer-events-none select-none" style="min-width: 250px; max-width: 290px; pointer-events: none; user-select: none;">
        <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
          <div class="flex items-center gap-1.5">
            <span class="w-3.5 h-3.5 rounded-[4px] bg-emerald-600 shrink-0 flex items-center justify-center text-white">
              ${RECYCLE_SVG_12PX}
            </span>
            <span class="font-extrabold text-xs text-slate-900">${getNodeDisplayLabel(node)}</span>
          </div>
          <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            Recycling Centre
          </span>
        </div>

        <div class="space-y-1.5 text-xs">
          <!-- Capacity Gauge -->
          <div class="bg-slate-50 p-2 rounded-lg border border-slate-200/80 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[9px] uppercase font-bold text-slate-400">Live Capacity</span>
              <span class="font-extrabold text-emerald-700 text-xs">${used} / ${maxCap} kg</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: ${pct}%;"></div>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-500 font-medium">
              <span>${pct}% filled</span>
              <span class="text-emerald-700 font-bold">${freeCap} kg free</span>
            </div>
          </div>

          <!-- Accepted Categories -->
          <div class="p-1.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5">
            <span class="text-[9px] uppercase font-bold text-slate-400 block">Accepted Streams:</span>
            <div class="flex flex-wrap gap-1">
              ${accepted.map((t) => `<span class="px-1 py-0.5 rounded text-[9.5px] font-medium bg-white border border-slate-200 text-slate-700">${t}</span>`).join('')}
            </div>
          </div>

          <!-- Inbound Pickups -->
          ${inbound.length > 0 ? `
            <div class="p-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200 text-emerald-950 space-y-0.5">
              <span class="text-[9px] uppercase font-bold text-emerald-800 block">Assigned Inbound:</span>
              <div class="text-[10px] font-semibold text-emerald-900">
                ${inbound.map((a) => `${a.pickup_name} (${a.weight_kg}kg)`).join(', ')}
              </div>
            </div>
          ` : `
            <div class="text-[10px] text-slate-400 italic">No pickups currently assigned</div>
          `}
        </div>
      </div>
    `;
  }

  // Junction
  return `
    <div class="p-3 text-left font-sans text-slate-800 pointer-events-none select-none" style="min-width: 240px; max-width: 280px; pointer-events: none; user-select: none;">
      <div class="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full border border-slate-500 bg-white shrink-0"></span>
          <span class="font-extrabold text-sm text-slate-900">${getNodeDisplayLabel(node)}</span>
        </div>
        <span class="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          Transit Junction
        </span>
      </div>
      <p class="text-xs text-slate-600 leading-snug">
        Arterial highway intersection connecting shortest path routing across Delhi NCR.
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
  isPlaying = false,
  isRunAll = false,
  onSelectPickup = () => {},
  onMetricChange = () => {},
  onSelectEdge = () => {},
  onInspectNode = () => {},
  onCreatePickup = () => {},
  onCreateCentre = () => {},
  onConnectNodes = () => {},
  onVehicleFinish = () => {},
}) {
  const outerContainerRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Hover Tooltip Popup Reference
  const hoverPopupRef = useRef(null);

  // Snake Traversal Animation Refs
  const snakeArrowMarkerRef = useRef(null);
  const snakeAnimFrameRef = useRef(null);
  const animatingEdgeIdRef = useRef(null);

  // Vehicle Animation State & Refs
  const [isCarDriving, setIsCarDriving] = useState(false);
  const isCarDrivingRef = useRef(false);
  isCarDrivingRef.current = isCarDriving;
  const carMarkerRef = useRef(null);
  const carAnimFrameRef = useRef(null);
  const lastDrivenStepKeyRef = useRef(null);
  const arrivalTimeoutRef = useRef(null);
  const ignitionTimeoutRef = useRef(null);
  const idleSoundTimeoutRef = useRef(null);
  const coolDownTimeoutRef = useRef(null);
  const arrivalBrakeTimeoutRef = useRef(null);
  const finishCallbackTimeoutRef = useRef(null);
  const isFocusModeRef = useRef(false);
  const focusEndpointsRef = useRef({ startId: null, endId: null });
  const cameraBearingRef = useRef(0);
  const telemetryPillRef = useRef(null);

  // Helper to update car visual states (headlights, brakelights, engine rumble, exhaust puffs)
  const setCarState = useCallback(({ headlights, brakelights, rumble, puffing } = {}) => {
    const el = carMarkerRef.current?.getElement();
    if (!el) return;
    const hl = el.querySelector('.car-headlights');
    const bl = el.querySelector('.car-brakelights');
    const rumbleGroup = el.querySelector('.car-rumble-group');
    if (hl && headlights != null) hl.style.opacity = headlights ? '1' : '0';
    if (bl && brakelights != null) bl.style.opacity = brakelights ? '1' : '0';
    if (rumbleGroup && rumble != null) {
      if (rumble) {
        rumbleGroup.classList.add('car-rumble-active');
      } else {
        rumbleGroup.classList.remove('car-rumble-active');
      }
    }
    if (puffing != null) {
      if (puffing) {
        el.classList.add('car-puffing');
      } else {
        el.classList.remove('car-puffing');
      }
    }
  }, []);

  const setCarLights = useCallback((headlightsOn, brakeLightsOn) => {
    setCarState({ headlights: headlightsOn, brakelights: brakeLightsOn });
  }, [setCarState]);

  // Markers references
  const nodeMarkersRef = useRef({});
  const midpointMarkersRef = useRef({});
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
  const [selectedStreams, setSelectedStreams] = useState(ALL_STREAMS);
  const selectedStreamsRef = useRef(selectedStreams);
  selectedStreamsRef.current = selectedStreams;

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
  const onInspectNodeRef = useRef(onInspectNode);
  onInspectNodeRef.current = onInspectNode;
  const onCreatePickupRef = useRef(onCreatePickup);
  onCreatePickupRef.current = onCreatePickup;
  const onCreateCentreRef = useRef(onCreateCentre);
  onCreateCentreRef.current = onCreateCentre;
  const onConnectNodesRef = useRef(onConnectNodes);
  onConnectNodesRef.current = onConnectNodes;
  const onSelectPickupRef = useRef(onSelectPickup);
  onSelectPickupRef.current = onSelectPickup;
  const onVehicleFinishRef = useRef(onVehicleFinish);
  onVehicleFinishRef.current = onVehicleFinish;
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
  const nodesMapRef = useRef(nodesMap);
  nodesMapRef.current = nodesMap;
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;
  const activePathNodesRef = useRef(activePathNodes);
  activePathNodesRef.current = activePathNodes;

  // Show toast notification helper
  const showToast = useCallback((msg, type = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4500);
  }, []);

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  // Toggle accepted streams for centre creation (prevents deselecting the very last remaining stream)
  const handleToggleStream = useCallback((stream) => {
    setSelectedStreams((prev) => {
      if (prev.includes(stream)) {
        if (prev.length <= 1) {
          showToast('Centre must accept at least one stream.', 'info');
          return prev;
        }
        return prev.filter((s) => s !== stream);
      } else {
        return [...prev, stream];
      }
    });
  }, [showToast]);

  // Mutually exclusive interaction modes helper
  const handleSelectMode = useCallback((nextMode) => {
    setMode((prev) => (prev === nextMode && nextMode !== 'inspect' ? 'inspect' : nextMode));
    setConnectSourceNode(null);
    if (hoverPopupRef.current) {
      hoverPopupRef.current.remove();
    }
    setSearchDropdownOpen(false);
    if (nextMode === 'connect_road') {
      showToast('Click 1st node to begin straight road connection.', 'info');
    }
  }, [showToast]);

  // Fit bounds helper - uses nodesRef.current so dependency array is strictly empty
  const fitAllNodes = useCallback((map, duration = 600) => {
    const targetMap = map || mapRef.current;
    const currentNodes = nodesRef.current || [];
    if (!targetMap || currentNodes.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    currentNodes.forEach((n) => {
      if (n.lat != null && n.lng != null) {
        bounds.extend([Number(n.lng), Number(n.lat)]);
      }
    });
    if (!bounds.isEmpty()) {
      targetMap.fitBounds(bounds, {
        padding: { top: 145, bottom: 70, left: 72, right: 72 },
        maxZoom: 12.5,
        pitch: 0,
        bearing: 0,
        duration,
      });
    }
  }, []);

  // Auto-fit bounds on initial load
  const hasInitialFitRef = useRef(false);
  useEffect(() => {
    if (mapInstance && isMapLoaded && nodes.length > 0 && !hasInitialFitRef.current) {
      hasInitialFitRef.current = true;
      fitAllNodes(mapInstance, 0);
    }
  }, [mapInstance, isMapLoaded, nodes.length, fitAllNodes]);

  // 2. Ensure Graph GeoJSON Sources & Line Layers on Map (ZERO filter expressions)
  const ensureGraphLayers = useCallback((map) => {
    const targetMap = map || mapRef.current;
    if (!isMapReady(targetMap)) return;

    // 1. edges-base-source & layers: edges-casing FIRST, then edges-base on top
    if (!targetMap.getSource('edges-base-source')) {
      targetMap.addSource('edges-base-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getLayer('edges-casing')) {
      targetMap.addLayer({
        id: 'edges-casing',
        type: 'line',
        source: 'edges-base-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 4.0,
          'line-opacity': 0.9,
          'line-opacity-transition': { duration: 350, delay: 0 },
        },
      });
    }
    if (!targetMap.getLayer('edges-base')) {
      targetMap.addLayer({
        id: 'edges-base',
        type: 'line',
        source: 'edges-base-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#94A3B8',
          'line-width': 1.8,
          'line-opacity': 0.68,
          'line-opacity-transition': { duration: 350, delay: 0 },
        },
      });
    }

    // 2. edges-rejected-source & layer: edges-rejected
    if (!targetMap.getSource('edges-rejected-source')) {
      targetMap.addSource('edges-rejected-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getLayer('edges-rejected')) {
      targetMap.addLayer({
        id: 'edges-rejected',
        type: 'line',
        source: 'edges-rejected-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#64748B',
          'line-width': 2.2,
          'line-dasharray': [1.4, 2.0],
          'line-opacity': 0.8,
          'line-opacity-transition': { duration: 350, delay: 0 },
        },
      });
    }

    // 3. edges-spt-source & layer: edges-spt
    if (!targetMap.getSource('edges-spt-source')) {
      targetMap.addSource('edges-spt-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getLayer('edges-spt')) {
      targetMap.addLayer({
        id: 'edges-spt',
        type: 'line',
        source: 'edges-spt-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#0F172A',
          'line-width': 3.2,
          'line-opacity': 1.0,
          'line-opacity-transition': { duration: 350, delay: 0 },
        },
      });
    }

    // 4. edges-blocked-source & layer: edges-blocked
    if (!targetMap.getSource('edges-blocked-source')) {
      targetMap.addSource('edges-blocked-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getLayer('edges-blocked')) {
      targetMap.addLayer({
        id: 'edges-blocked',
        type: 'line',
        source: 'edges-blocked-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#EF4444',
          'line-width': 2.4,
          'line-dasharray': [2, 2],
          'line-opacity': 1.0,
          'line-opacity-transition': { duration: 350, delay: 0 },
        },
      });
    }

    // 5. edges-traversing-source & layer: edges-traversing
    if (!targetMap.getSource('edges-traversing-source')) {
      targetMap.addSource('edges-traversing-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getLayer('edges-traversing')) {
      targetMap.addLayer({
        id: 'edges-traversing',
        type: 'line',
        source: 'edges-traversing-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#0F172A',
          'line-width': 3.8,
          'line-opacity': 1.0,
          'line-opacity-transition': { duration: 350, delay: 0 },
        },
      });
    }

    // 6. Dedicated Always-Visible Route Sources & Layers (edges-route-preview-source & edges-route-drawn-source)
    if (!targetMap.getSource('edges-route-preview-source')) {
      targetMap.addSource('edges-route-preview-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getSource('edges-route-drawn-source')) {
      targetMap.addSource('edges-route-drawn-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    const hitBeforeId = targetMap.getLayer('edges-hit') ? 'edges-hit' : undefined;

    // 1. edges-route-casing: crisp white halo ahead and behind
    if (!targetMap.getLayer('edges-route-casing')) {
      targetMap.addLayer(
        {
          id: 'edges-route-casing',
          type: 'line',
          source: 'edges-route-preview-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'miter',
          },
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 7.5,
            'line-opacity': 0.95,
          },
        },
        hitBeforeId
      );
    }

    // 2. edges-route-preview-base: soft visible mint-emerald
    if (!targetMap.getLayer('edges-route-preview-base')) {
      targetMap.addLayer(
        {
          id: 'edges-route-preview-base',
          type: 'line',
          source: 'edges-route-preview-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'miter',
          },
          paint: {
            'line-color': '#A7F3D0',
            'line-width': 4.5,
            'line-opacity': 0.9,
          },
        },
        hitBeforeId
      );
    }

    // 3. edges-route-preview-dash: crisp emerald dashed navigation guide track ahead of headlights
    if (!targetMap.getLayer('edges-route-preview-dash')) {
      targetMap.addLayer(
        {
          id: 'edges-route-preview-dash',
          type: 'line',
          source: 'edges-route-preview-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'miter',
          },
          paint: {
            'line-color': '#059669',
            'line-width': 2.2,
            'line-dasharray': [2, 2],
            'line-opacity': 0.75,
          },
        },
        hitBeforeId
      );
    }

    // 4. edges-route-drawn: bold solid emerald drawn 0 -> progress directly ON TOP
    if (!targetMap.getLayer('edges-route-drawn')) {
      targetMap.addLayer(
        {
          id: 'edges-route-drawn',
          type: 'line',
          source: 'edges-route-drawn-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'miter',
          },
          paint: {
            'line-color': '#059669',
            'line-width': 4.8,
            'line-opacity': 1.0,
          },
        },
        hitBeforeId
      );
    }

    // 7. edges-hit-source & layer: edges-hit on top for Inspect road clicks
    if (!targetMap.getSource('edges-hit-source')) {
      targetMap.addSource('edges-hit-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!targetMap.getLayer('edges-hit')) {
      targetMap.addLayer({
        id: 'edges-hit',
        type: 'line',
        source: 'edges-hit-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#000000',
          'line-width': 22.0,
          'line-opacity': 0.001,
        },
      });
    }
  }, []);

  // 3. Update Graph GeoJSON Sources with zero MapLibre filter expressions
  const updateAllEdgeSources = useCallback(
    (map, currentEdges, currentNodes, excludedEdgeId = null) => {
      const targetMap = map || mapRef.current;
      if (!isMapReady(targetMap)) return;
      ensureGraphLayers(targetMap);

      const baseSource = targetMap.getSource('edges-base-source');
      const hitSource = targetMap.getSource('edges-hit-source');
      const blockedSource = targetMap.getSource('edges-blocked-source');
      const sptSource = targetMap.getSource('edges-spt-source');
      const rejectedSource = targetMap.getSource('edges-rejected-source');
      const routeDrawnSource = targetMap.getSource('edges-route-drawn-source');
      const routePreviewSource = targetMap.getSource('edges-route-preview-source');

      if (!baseSource || !hitSource) return;

      const nMap = {};
      (currentNodes || []).forEach((n) => {
        nMap[n.id] = n;
      });

      const predecessors = step.predecessors || {};
      const isAllSummary = activePickupId === null || activePickupId === 'ALL';

      const baseFeatures = [];
      const hitFeatures = [];
      const blockedFeatures = [];
      const sptFeatures = [];
      const rejectedFeatures = [];
      const allSummaryRouteFeatures = [];

      (currentEdges || []).forEach((edge) => {
        const u = nMap[edge.source_id];
        const v = nMap[edge.target_id];
        if (!u || !v || u.lat == null || u.lng == null || v.lat == null || v.lng == null) {
          return;
        }

        const polylineCoords = getEdgePolyline(edge, u, v);

        const feature = {
          type: 'Feature',
          properties: {
            id: edge.id,
            source_id: edge.source_id,
            target_id: edge.target_id,
            base_distance_km: edge.base_distance_km,
            base_time_min: edge.base_time_min,
            is_blocked: edge.is_blocked ? 1 : 0,
            traffic_factor: edge.traffic_factor || 1.0,
          },
          geometry: {
            type: 'LineString',
            coordinates: polylineCoords,
          },
        };

        // Every road is in base source and hit source immediately at Step 1
        baseFeatures.push(feature);
        hitFeatures.push(feature);

        // Blocked edges
        if (edge.is_blocked || previousPathEdgesSet.has(edge.id)) {
          blockedFeatures.push(feature);
          return;
        }

        // Prevent Instant Snapping: EXCLUDE (u -> v) from static sources while animating
        const isAnimatingThisEdge =
          excludedEdgeId &&
          (edge.id === excludedEdgeId ||
            (edge.source_id === step.from_node && edge.target_id === step.to_node) ||
            (edge.source_id === step.to_node && edge.target_id === step.from_node));

        if (isAllSummary) {
          if (activePathEdgesSet.has(edge.id)) {
            allSummaryRouteFeatures.push(feature);
          }
        } else {
          const uId = edge.source_id;
          const vId = edge.target_id;
          const inSPT = predecessors[vId] === uId || predecessors[uId] === vId;

          if (inSPT) {
            if (!isAnimatingThisEdge) {
              sptFeatures.push(feature);
            }
          } else if (visitedNodes.has(uId) && visitedNodes.has(vId)) {
            if (!isAnimatingThisEdge) {
              rejectedFeatures.push(feature);
            }
          }
        }
      });

      baseSource.setData({ type: 'FeatureCollection', features: baseFeatures });
      hitSource.setData({ type: 'FeatureCollection', features: hitFeatures });
      if (blockedSource) blockedSource.setData({ type: 'FeatureCollection', features: blockedFeatures });
      if (sptSource) sptSource.setData({ type: 'FeatureCollection', features: sptFeatures });
      if (rejectedSource) rejectedSource.setData({ type: 'FeatureCollection', features: rejectedFeatures });

      if (isAllSummary && routeDrawnSource) {
        routeDrawnSource.setData({ type: 'FeatureCollection', features: allSummaryRouteFeatures });
        if (routePreviewSource) {
          routePreviewSource.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    },
    [ensureGraphLayers, step, activePickupId, activePathEdgesSet, previousPathEdgesSet, visitedNodes]
  );

  // 4. Initialize MapLibre GL Map strictly ONCE on mount
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
          updateAllEdgeSources(map, edgesRef.current, nodesRef.current, null);
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
              showToastRef.current(`Placed ${defaultName} (${cat}, ${wt} kg)!`, 'success');
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
                accepted_types: selectedStreamsRef.current.length > 0 ? selectedStreamsRef.current : ALL_STREAMS,
              });
              showToastRef.current(`Placed ${defaultName} (${cap} kg)!`, 'success');
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
      if (snakeAnimFrameRef.current) {
        cancelAnimationFrame(snakeAnimFrameRef.current);
        snakeAnimFrameRef.current = null;
      }
      if (snakeArrowMarkerRef.current) {
        snakeArrowMarkerRef.current.remove();
        snakeArrowMarkerRef.current = null;
      }
      if (carAnimFrameRef.current) {
        cancelAnimationFrame(carAnimFrameRef.current);
        carAnimFrameRef.current = null;
      }
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
      }
      Object.keys(nodeMarkersRef.current).forEach((k) => {
        nodeMarkersRef.current[k].remove();
      });
      nodeMarkersRef.current = {};
      Object.keys(midpointMarkersRef.current).forEach((k) => {
        midpointMarkersRef.current[k].remove();
      });
      midpointMarkersRef.current = {};
      if (arrivalTimeoutRef.current) {
        clearTimeout(arrivalTimeoutRef.current);
        arrivalTimeoutRef.current = null;
      }
      if (ignitionTimeoutRef.current) {
        clearTimeout(ignitionTimeoutRef.current);
        ignitionTimeoutRef.current = null;
      }
      if (idleSoundTimeoutRef.current) {
        clearTimeout(idleSoundTimeoutRef.current);
        idleSoundTimeoutRef.current = null;
      }
      if (coolDownTimeoutRef.current) {
        clearTimeout(coolDownTimeoutRef.current);
        coolDownTimeoutRef.current = null;
      }
      if (arrivalBrakeTimeoutRef.current) {
        clearTimeout(arrivalBrakeTimeoutRef.current);
        arrivalBrakeTimeoutRef.current = null;
      }
      if (finishCallbackTimeoutRef.current) {
        clearTimeout(finishCallbackTimeoutRef.current);
        finishCallbackTimeoutRef.current = null;
      }
      stopAllSounds();
      setCarLights(false, false);
      if (mapContainerRef.current) {
        mapContainerRef.current.classList.remove('car-focus-active');
      }
      if (outerContainerRef.current) {
        outerContainerRef.current.classList.remove('car-focus-active');
      }
      if (carMarkerRef.current) {
        carMarkerRef.current.remove();
        carMarkerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Strictly empty dependency array: map is initialized once and never destroyed during playback!

  // 5. Sync Graph GeoJSON Sources whenever edges, nodes, step, or activePickupId updates
  useEffect(() => {
    if (mapInstance && isMapLoaded) {
      updateAllEdgeSources(mapInstance, edges, nodes, animatingEdgeIdRef.current);
    }
  }, [mapInstance, isMapLoaded, edges, nodes, step, activePickupId, updateAllEdgeSources]);

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

      // Cost value formatting: compact without trailing .0 (e.g. 8m, 26m, 14km)
      let displayCost = '';
      if (isBlocked) {
        displayCost = '⛔ Blocked';
      } else if (metric === 'time') {
        const effectiveTime = (edge.base_time_min || 0) * traffic;
        const rounded = Math.round(effectiveTime * 10) / 10;
        const numStr = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
        displayCost = `${numStr}m`;
      } else {
        const distKm = edge.base_distance_km || 0;
        const rounded = Math.round(distKm * 10) / 10;
        const numStr = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
        displayCost = `${numStr}km`;
      }

      if (traffic > 1.0 && !isBlocked) {
        displayCost += ` ${traffic}×`;
      }

      let marker = currentPills[edge.id];
      if (!marker) {
        const rootEl = document.createElement('div');
        rootEl.className = 'midpoint-pill-wrapper eco-edge-pill';
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
      pillEl.classList.add('eco-edge-pill');
      pillEl.onclick = (e) => {
        e.stopPropagation();
        onSelectEdgeRef.current(edge);
      };

      let pillClass = 'bg-white/95 text-slate-600 border-slate-200/90 shadow-2xs hover:border-slate-400';
      if (isBlocked) {
        pillClass = 'bg-rose-50 border-rose-300 text-rose-700 font-bold';
      } else if (isRoute) {
        pillClass = 'bg-emerald-600 border-emerald-600 text-white shadow-2xs';
      } else if (isActiveRelaxation) {
        pillClass = 'bg-amber-500 border-amber-500 text-white font-bold scale-105 shadow-xs';
      }

      pillEl.innerHTML = `
        <div class="text-[10px] font-mono font-semibold leading-none px-1.5 py-0.5 rounded-full whitespace-nowrap border transition-all edge-cost-pill eco-edge-pill ${pillClass}" style="font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums;">
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

  // 7. Render Node Markers (Compact Flat GIS SVG Markers & Haloed Labels)
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
      const isActivePickup = activePickupId === node.id;
      const isInActivePath = activePathNodesSet.has(node.id);
      const isVisited = visitedNodes.has(node.id);

      // Contrast determination: Inactive pickups and junctions dimmed to 0.72
      // Active pickup, path nodes, popped nodes, and recycling centres remain at full contrast 1.0
      let nodeOpacity = 1.0;
      if ((nodeKind === 'pickup' && !isActivePickup && !isInActivePath && !isPopped) ||
          (nodeKind === 'junction' && !isInActivePath && !isPopped && !isVisited && !isConnectSource)) {
        nodeOpacity = 0.72;
      }

      // Dijkstra Distance Cost Chip:
      // Show tiny floating cost pills (0m, 8m, 17m) ONLY on nodes Dijkstra has discovered/relaxed
      // Untouched infinity nodes remain completely unbadged
      const dist = dijkstraDistances[node.id];
      let distBadge = '';
      if (dist != null && Number.isFinite(Number(dist)) && Number(dist) < 9000 && activePickupId !== 'ALL') {
        const rounded = Math.round(Number(dist) * 10) / 10;
        const numStr = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
        const unit = metric === 'time' ? 'm' : 'km';
        distBadge = `<div class="eco-cost-chip mb-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-white/95 border border-slate-200/90 text-slate-700 shadow-2xs edge-cost-pill leading-none pointer-events-none select-none" style="font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; pointer-events: none;">${numStr}${unit}</div>`;
      }

      // Centre Decision Badges during Greedy evaluation and confirmation steps
      let greedyBadge = '';
      const isGreedyOrConfirm =
        step.event_type === 'greedy_eval' ||
        step.event_type === 'route_confirm';

      let isAssignedCentre = false;

      if (nodeKind === 'centre') {
        const check = candidateChecklist.find((c) => c.centre_id === node.id);
        const alloc = allocationsMap[activePickupId];

        // Winning assigned destination centre for the active pickup
        const isWinningAssignedDestination =
          (alloc && alloc.assigned_centre_id === node.id) ||
          (step.event_type === 'route_confirm' &&
            (step.to_node === node.id ||
             step.current_node === node.id ||
             (activePathNodes.length > 1 && activePathNodes[activePathNodes.length - 1] === node.id)));

        isAssignedCentre =
          isWinningAssignedDestination ||
          (check && (check.status === 'assigned' || check.assigned || check.status_badge === 'assigned'));

        if (isGreedyOrConfirm) {
          if (step.event_type === 'route_confirm' && isWinningAssignedDestination) {
            // Winning assigned destination on route_confirm must ALWAYS display green Assigned, never red Capacity Full
            greedyBadge = renderStatusBadge('assigned', 'Assigned');
          } else if (check) {
            if (isAssignedCentre) {
              greedyBadge = renderStatusBadge('assigned', 'Assigned');
            } else if (check.status_badge === 'capacity_full' || (check.reason && check.reason.toLowerCase().includes('capacity'))) {
              greedyBadge = renderStatusBadge('capacity_full', 'Capacity Full');
            } else if (check.status_badge === 'wrong_category' || (check.reason && check.reason.toLowerCase().includes('category'))) {
              greedyBadge = renderStatusBadge('wrong_category', 'Wrong Type');
            } else if (check.reason && check.reason.toLowerCase().includes('blocked')) {
              greedyBadge = renderStatusBadge('blocked', 'Blocked');
            }
          }
        }
      }

      let marker = currentMarkers[node.id];
      if (!marker) {
        const rootEl = document.createElement('div');
        rootEl.className = 'node-marker-wrapper eco-node-marker';
        rootEl.setAttribute('data-node-id', node.id);
        rootEl.style.zIndex = isPopped ? '20' : '10'; // Keep inside map container (<= 10, hovered/popped: 20)
        rootEl.style.pointerEvents = 'none';

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
        marker.getElement().style.zIndex = isPopped ? '20' : '10';
      }

      const el = marker.getElement();
      el.classList.add('eco-node-marker');
      el.setAttribute('data-node-id', node.id);
      if (isFocusModeRef.current) {
        const { startId, endId } = focusEndpointsRef.current;
        if (node.id === startId || node.id === endId) {
          el.setAttribute('data-focus-keep', 'true');
        } else {
          el.removeAttribute('data-focus-keep');
        }
      } else {
        el.removeAttribute('data-focus-keep');
      }

      el.style.opacity = String(nodeOpacity);
      el.style.pointerEvents = 'none';

      // Compact Flat GIS SVG Markers:
      let pinHtml = '';
      if (nodeKind === 'pickup') {
        const catColor = CATEGORY_COLORS[node.waste_type] || '#EA580C';
        if (isActivePickup) {
          // Active / Selected Pickup: 20px inside crisp 2px colored focus ring with 3px gap
          pinHtml = `
            <div class="node-pin-inner" style="
              width: 20px;
              height: 20px;
              border-radius: 9999px;
              background-color: ${catColor};
              border: 2px solid #FFFFFF;
              box-shadow: 0 0 0 3px #FFFFFF, 0 0 0 5px ${catColor}, 0 2px 6px rgba(15,23,42,0.22);
              display: flex;
              align-items: center;
              justify-content: center;
              transition: transform 0.15s ease-out;
              transform: ${isPopped ? 'scale(1.15)' : 'scale(1)'};
            ">
              <div style="width: 6px; height: 6px; border-radius: 9999px; background-color: #FFFFFF;"></div>
            </div>
          `;
        } else {
          // Inactive Pickup: 16px solid colored circle with crisp 5px white center dot and 2px white outer border
          pinHtml = `
            <div class="node-pin-inner" style="
              width: 16px;
              height: 16px;
              border-radius: 9999px;
              background-color: ${catColor};
              border: 2px solid #FFFFFF;
              box-shadow: 0 1px 3px rgba(15,23,42,0.18);
              display: flex;
              align-items: center;
              justify-content: center;
              transition: transform 0.15s ease-out;
              transform: ${isPopped ? 'scale(1.2)' : 'scale(1)'};
            ">
              <div style="width: 5px; height: 5px; border-radius: 9999px; background-color: #FFFFFF;"></div>
            </div>
          `;
        }
      } else if (nodeKind === 'centre') {
        // Recycling Centres (R1–R3+):
        // 20px compact rounded square (rounded-[5px], white fill, 2px #059669 emerald border) containing 12px emerald Lucide Recycle SVG.
        // Switches to solid #059669 with a white icon when assigned.
        if (isAssignedCentre) {
          pinHtml = `
            <div class="node-pin-inner" style="
              width: 20px;
              height: 20px;
              border-radius: 5px;
              background-color: #059669;
              border: 2px solid #047857;
              box-shadow: 0 2px 6px rgba(5,150,105,0.32);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #FFFFFF;
              transition: transform 0.15s ease-out;
              transform: ${isPopped ? 'scale(1.2)' : 'scale(1)'};
            ">
              ${RECYCLE_SVG_12PX_WHITE}
            </div>
          `;
        } else {
          pinHtml = `
            <div class="node-pin-inner" style="
              width: 20px;
              height: 20px;
              border-radius: 5px;
              background-color: #FFFFFF;
              border: 2px solid #059669;
              box-shadow: 0 1px 4px rgba(15,23,42,0.12);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #059669;
              transition: transform 0.15s ease-out;
              transform: ${isPopped ? 'scale(1.2)' : 'scale(1)'};
            ">
              ${RECYCLE_SVG_12PX}
            </div>
          `;
        }
      } else {
        // Road Junctions (J1–J4):
        // Clean 10px bullseye dots:
        // unvisited: muted gray #94A3B8 core + white ring;
        // visited/settled by Dijkstra: crisp dark #0F172A core + 2px white ring + dark outer border
        if (isVisited || isInActivePath || isPopped) {
          pinHtml = `
            <div class="node-pin-inner" style="
              width: 11px;
              height: 11px;
              border-radius: 9999px;
              background-color: #FFFFFF;
              border: 1.5px solid #0F172A;
              box-shadow: 0 1px 3px rgba(15,23,42,0.22);
              display: flex;
              align-items: center;
              justify-content: center;
              transition: transform 0.15s ease-out;
              transform: ${isPopped ? 'scale(1.25)' : 'scale(1)'};
            ">
              <div style="width: 5px; height: 5px; border-radius: 9999px; background-color: #0F172A;"></div>
            </div>
          `;
        } else {
          pinHtml = `
            <div class="node-pin-inner" style="
              width: 10px;
              height: 10px;
              border-radius: 9999px;
              background-color: #FFFFFF;
              border: 1.5px solid #CBD5E1;
              box-shadow: 0 1px 2px rgba(15,23,42,0.12);
              display: flex;
              align-items: center;
              justify-content: center;
              transition: transform 0.15s ease-out;
            ">
              <div style="width: 4px; height: 4px; border-radius: 9999px; background-color: #94A3B8;"></div>
            </div>
          `;
        }
      }

      // Clean Single-Line Haloed Labels directly below each node
      const labelText = getNodeDisplayLabel(node);

      if (nodeKind === 'centre') {
        const isR3 = node.id === 'R3';
        const labelAndBadgeHtml = isR3
          ? `
            <div style="position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(100% + 4px); white-space: nowrap; pointer-events: none; display: flex; flex-direction: column; align-items: center;">
              ${distBadge}
              <div class="map-halo-label pointer-events-none select-none">${labelText}</div>
              ${greedyBadge}
            </div>
          `
          : `
            ${distBadge ? `<div style="position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(100% + 3px); white-space: nowrap; pointer-events: none;">${distBadge}</div>` : ''}
            <div style="position: absolute; left: 50%; transform: translateX(-50%); top: calc(100% + 3px); white-space: nowrap; pointer-events: none; display: flex; flex-direction: column; align-items: center;">
              <div class="map-halo-label pointer-events-none select-none">${labelText}</div>
              ${greedyBadge}
            </div>
          `;

        el.style.width = '24px';
        el.style.height = '24px';

        el.innerHTML = `
          <div class="node-hit-target" style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; pointer-events: auto; cursor: pointer;">
            ${isConnectSource ? `<div class="absolute -inset-2 rounded-full bg-amber-400/35 animate-pulse pointer-events-none"></div>` : ''}
            ${pinHtml}
            ${labelAndBadgeHtml}
          </div>
        `;
      } else {
        el.style.width = '';
        el.style.height = '';

        el.innerHTML = `
          <div class="relative flex flex-col items-center select-none pointer-events-none">
            ${isConnectSource ? `<div class="absolute -inset-2 rounded-full bg-amber-400/35 animate-pulse pointer-events-none"></div>` : ''}
            ${distBadge}
            <div class="node-hit-target" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; pointer-events: auto; cursor: pointer;">
              ${pinHtml}
            </div>
            <div class="map-halo-label mt-0.5 pointer-events-none select-none">${labelText}</div>
            ${greedyBadge}
          </div>
        `;
      }

      const hitTarget = el.querySelector('.node-hit-target');
      if (hitTarget) {
        // Node Hover Card Handler attached ONLY to the stable fixed-size hit target
        hitTarget.onmouseenter = () => {
          el.style.zIndex = '20';
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

        hitTarget.onmouseleave = () => {
          el.style.zIndex = isPopped ? '20' : '10';
          if (hoverPopupRef.current) {
            hoverPopupRef.current.remove();
          }
        };

        // Node Click Handler
        hitTarget.onclick = (e) => {
          e.stopPropagation();
          const currentMode = modeRef.current;
          if (currentMode === 'connect_road') {
            if (!connectSourceNodeRef.current) {
              setConnectSourceNode(node);
              showToast(`Selected "${getNodeDisplayLabel(node)}". Click second node to connect road.`, 'info');
            } else if (connectSourceNodeRef.current.id === node.id) {
              setConnectSourceNode(null);
              showToast('Deselected source node.', 'info');
            } else {
              onConnectNodesRef.current(connectSourceNodeRef.current.id, node.id);
              showToast(`Road connected between ${getNodeDisplayLabel(connectSourceNodeRef.current)} and ${getNodeDisplayLabel(node)}!`, 'success');
              setConnectSourceNode(null);
              setMode('inspect');
            }
            return;
          }

          const kind = String(node.kind || node.type || (node.id && node.id.startsWith('P') ? 'pickup' : node.id && node.id.startsWith('R') ? 'centre' : '')).toLowerCase();
          if (modeRef.current === 'inspect' && (kind === 'pickup' || kind === 'centre')) {
            if (hoverPopupRef.current) {
              hoverPopupRef.current.remove();
            }
            onInspectNodeRef.current?.(node);
            return;
          }

          if (modeRef.current === 'inspect') {
            showToast(`${getNodeDisplayLabel(node)} (${kind.toUpperCase()})`, 'info');
          }
        };
      }
    });
  }, [
    mapInstance,
    isMapLoaded,
    nodes,
    allocationsMap,
    activePickupId,
    currentPoppedNode,
    activePathNodesSet,
    visitedNodes,
    dijkstraDistances,
    metric,
    candidateChecklist,
    connectSourceNode,
    showToast,
  ]);

  // 8. True "Snake Game" Trailing Black Line + Front Arrowhead Engine (60 FPS requestAnimationFrame)
  const easeInOutCubic = useCallback((t) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!isMapReady(map)) return;

    ensureGraphLayers(map);
    const traversingSource = map.getSource('edges-traversing-source');

    // Cancel any prior edge animation
    if (snakeAnimFrameRef.current) {
      cancelAnimationFrame(snakeAnimFrameRef.current);
      snakeAnimFrameRef.current = null;
    }

    // Ensure snakeArrowMarker DOM marker exists
    if (!snakeArrowMarkerRef.current) {
      const arrowEl = document.createElement('div');
      arrowEl.className = 'snake-arrow-marker';
      arrowEl.style.width = '15px';
      arrowEl.style.height = '15px';
      arrowEl.style.pointerEvents = 'none';
      arrowEl.style.transition = 'none !important';
      arrowEl.style.display = 'none';
      arrowEl.style.zIndex = '12';
      arrowEl.innerHTML = `
        <div id="snake-arrow-inner" style="width: 15px; height: 15px; transform-origin: center; transition: none !important; display: flex; align-items: center; justify-content: center; pointer-events: none;">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; overflow: visible; pointer-events: none; filter: drop-shadow(0 0 1px #FFFFFF);">
            <path d="M 1.5 2.5 L 13.5 7.5 L 1.5 12.5 L 4.8 7.5 Z" fill="#0F172A" stroke="#FFFFFF" stroke-width="1.2" stroke-linejoin="round" />
          </svg>
        </div>
      `;
      snakeArrowMarkerRef.current = new maplibregl.Marker({
        element: arrowEl,
        anchor: 'center',
        subpixelPositioning: false,
      })
        .setLngLat([0, 0])
        .addTo(map);
    }

    const arrowEl = snakeArrowMarkerRef.current.getElement();
    const arrowInner = arrowEl?.querySelector('#snake-arrow-inner');

    const clearTraversing = () => {
      if (traversingSource) {
        traversingSource.setData({ type: 'FeatureCollection', features: [] });
      }
      if (arrowEl) {
        arrowEl.style.display = 'none';
      }
      animatingEdgeIdRef.current = null;
    };

    if (step.event_type !== 'dijkstra_relax' || !step.from_node || !step.to_node) {
      clearTraversing();
      return;
    }

    const u = nodesMap[step.from_node];
    const v = nodesMap[step.to_node];
    if (!u || !v || u.lng == null || u.lat == null || v.lng == null || v.lat == null) {
      clearTraversing();
      return;
    }

    const activeEdge = edgesRef.current.find(
      (e) => (e.source_id === step.from_node && e.target_id === step.to_node) ||
             (e.source_id === step.to_node && e.target_id === step.from_node)
    );
    const orientedCoords = getEdgePolyline(activeEdge || { id: `${step.from_node}->${step.to_node}` }, u, v);
    if (!orientedCoords || orientedCoords.length < 2) {
      clearTraversing();
      return;
    }

    const toNodeId = step.to_node;
    const activeEdgeId = step.active_edge_id || activeEdge?.id || `${step.from_node}->${step.to_node}`;
    animatingEdgeIdRef.current = activeEdgeId;

    // Prevent Instant Snapping: EXCLUDE (u -> v) from static sources while animating
    updateAllEdgeSources(map, edgesRef.current, nodesRef.current, activeEdgeId);

    const initialSlice = slicePolylineByProgress(orientedCoords, 0);
    if (arrowInner) {
      arrowInner.style.transform = `rotate(${initialSlice.angleDeg}deg)`;
    }
    if (arrowEl) {
      arrowEl.style.display = 'block';
    }
    snakeArrowMarkerRef.current.setLngLat(initialSlice.tipCoord);

    const speed = playbackSpeedRef.current || 1;
    const duration = Math.max(120, Math.floor(480 / speed));
    const startTime = performance.now();

    const animateTraverse = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeInOutCubic(progress);

      const { partialCoords, tipCoord, angleDeg } = slicePolylineByProgress(orientedCoords, eased);

      if (traversingSource) {
        traversingSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: partialCoords.length >= 2 ? partialCoords : [orientedCoords[0], tipCoord],
              },
            },
          ],
        });
      }

      if (snakeArrowMarkerRef.current) {
        snakeArrowMarkerRef.current.setLngLat(tipCoord);
      }
      if (arrowInner) {
        arrowInner.style.transform = `rotate(${angleDeg}deg)`;
      }

      if (progress < 1) {
        snakeAnimFrameRef.current = requestAnimationFrame(animateTraverse);
      } else {
        // Animation finished
        snakeAnimFrameRef.current = null;
        playNodeTick();
        if (arrowEl) {
          arrowEl.style.display = 'none';
        }
        if (traversingSource) {
          traversingSource.setData({ type: 'FeatureCollection', features: [] });
        }
        animatingEdgeIdRef.current = null;

        // Commit (u -> v) to static source (edges-spt-source or edges-rejected-source)
        updateAllEdgeSources(map, edgesRef.current, nodesRef.current, null);

        // Subtle pop on target node v
        const targetMarker = nodeMarkersRef.current[toNodeId];
        if (targetMarker) {
          const markerEl = targetMarker.getElement();
          const pinInner = markerEl?.querySelector('.node-pin-inner');
          if (pinInner) {
            pinInner.classList.remove('node-pop-active');
            void pinInner.offsetWidth;
            pinInner.classList.add('node-pop-active');
            setTimeout(() => {
              pinInner?.classList?.remove('node-pop-active');
            }, 250);
          }
        }
      }
    };

    snakeAnimFrameRef.current = requestAnimationFrame(animateTraverse);

    return () => {
      if (snakeAnimFrameRef.current) {
        cancelAnimationFrame(snakeAnimFrameRef.current);
        snakeAnimFrameRef.current = null;
      }
    };
  }, [step, nodesMap, ensureGraphLayers, updateAllEdgeSources, easeInOutCubic]);

  // 9. Automatic Vehicle Drive Engine (Mr. Bean Lime-Green Mini Cooper & 2.5D Spotlight Focus Mode)
  const activePickupIdRef = useRef(activePickupId);
  activePickupIdRef.current = activePickupId;

  // Spotlight Focus Mode: Dim background network & tilt camera into 2.5D perspective
  const enterFocusMode = useCallback((pickupNodeId, centreNodeId, fullRouteCoords) => {
    const map = mapRef.current;
    if (!isMapReady(map)) return;

    isFocusModeRef.current = true;
    focusEndpointsRef.current = { startId: pickupNodeId, endId: centreNodeId };

    // 1. Mark ONLY those two endpoint DOM markers (startId and endId) with data-focus-keep="true"
    Object.entries(nodeMarkersRef.current).forEach(([nodeId, marker]) => {
      const el = marker.getElement();
      if (!el) return;
      if (nodeId === pickupNodeId || nodeId === centreNodeId) {
        el.setAttribute('data-focus-keep', 'true');
      } else {
        el.removeAttribute('data-focus-keep');
      }
    });

    // 2. Add class car-focus-active to the map container div
    if (mapContainerRef.current) {
      mapContainerRef.current.classList.add('car-focus-active');
    }
    if (outerContainerRef.current) {
      outerContainerRef.current.classList.add('car-focus-active');
    }

    // 3. Set paint line-opacity to 0 on all non-route MapLibre line layers
    const lineLayersToFade = [
      'edges-base',
      'edges-casing',
      'edges-spt',
      'edges-rejected',
      'edges-blocked',
      'edges-traversing',
    ];
    lineLayersToFade.forEach((id) => {
      if (map.getLayer(id)) {
        map.setPaintProperty(id, 'line-opacity', 0);
      }
    });

    if (map.getLayer('edges-route-casing')) {
      map.setPaintProperty('edges-route-casing', 'line-opacity', 0.95);
    }
    if (map.getLayer('edges-route-preview-base')) {
      map.setPaintProperty('edges-route-preview-base', 'line-opacity', 0.9);
    }
    if (map.getLayer('edges-route-preview-dash')) {
      map.setPaintProperty('edges-route-preview-dash', 'line-opacity', 0.75);
    }
    if (map.getLayer('edges-route-drawn')) {
      map.setPaintProperty('edges-route-drawn', 'line-opacity', 1.0);
    }

    // Populate preview source with fullRouteCoords so the full optimal path is visible ahead immediately
    const routePreviewSource = map.getSource('edges-route-preview-source');
    if (routePreviewSource && fullRouteCoords && fullRouteCoords.length >= 2) {
      routePreviewSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: fullRouteCoords,
            },
          },
        ],
      });
    }

    // 4. Smooth 2.5D Chase Camera swoop to start node in chase position
    if (fullRouteCoords && fullRouteCoords.length >= 2) {
      const startSlice = slicePolylineByProgress(fullRouteCoords, 0);
      cameraBearingRef.current = startSlice.bearingDeg;

      map.easeTo({
        center: fullRouteCoords[0],
        pitch: 45,
        bearing: startSlice.bearingDeg,
        zoom: 14.5,
        duration: 900,
      });
    }
  }, []);

  // Exit Focus Mode: Smoothly restore camera back to top-down (pitch: 0, bearing: 0) and restore 100% network visibility
  const exitFocusMode = useCallback(
    (duration = 550) => {
      const map = mapRef.current;
      isFocusModeRef.current = false;
      focusEndpointsRef.current = { startId: null, endId: null };

      // Remove car-focus-active class
      if (mapContainerRef.current) {
        mapContainerRef.current.classList.remove('car-focus-active');
      }
      if (outerContainerRef.current) {
        outerContainerRef.current.classList.remove('car-focus-active');
      }

      // Remove data-focus-keep from all node markers
      Object.values(nodeMarkersRef.current).forEach((marker) => {
        const el = marker.getElement();
        if (el) {
          el.removeAttribute('data-focus-keep');
        }
      });

      // Fade out telemetry pill cleanly
      if (telemetryPillRef.current) {
        telemetryPillRef.current.style.opacity = '0';
        telemetryPillRef.current.style.transform = 'translate(-50%, 12px)';
        setTimeout(() => {
          if (telemetryPillRef.current && !isFocusModeRef.current) {
            telemetryPillRef.current.style.display = 'none';
          }
        }, 300);
      }

      // Clean up arrival ripple if attached
      const existingRipples = document.querySelectorAll('.centre-arrival-ripple');
      existingRipples.forEach((r) => r.remove());

      // Restore line layers back to 100% visibility
      if (isMapReady(map)) {
        const defaultOpacities = {
          'edges-base': 0.68,
          'edges-casing': 0.9,
          'edges-spt': 1.0,
          'edges-rejected': 0.8,
          'edges-blocked': 1.0,
          'edges-traversing': 1.0,
        };
        Object.entries(defaultOpacities).forEach(([id, opacity]) => {
          if (map.getLayer(id)) {
            map.setPaintProperty(id, 'line-opacity', opacity);
          }
        });

        // Cleanly clear edges-route-preview-source back to an empty FeatureCollection
        const routePreviewSource = map.getSource('edges-route-preview-source');
        if (routePreviewSource) {
          routePreviewSource.setData({ type: 'FeatureCollection', features: [] });
        }

        // Smoothly restore camera back to pitch: 0, bearing: 0 and fit all nodes
        fitAllNodes(map, duration || 750);
      }
    },
    [fitAllNodes]
  );

  // Bulletproof cleanup for vehicle animation, audio, and camera state
  const cleanupVehicleAndFocusMode = useCallback(() => {
    if (ignitionTimeoutRef.current) {
      clearTimeout(ignitionTimeoutRef.current);
      ignitionTimeoutRef.current = null;
    }
    if (idleSoundTimeoutRef.current) {
      clearTimeout(idleSoundTimeoutRef.current);
      idleSoundTimeoutRef.current = null;
    }
    if (coolDownTimeoutRef.current) {
      clearTimeout(coolDownTimeoutRef.current);
      coolDownTimeoutRef.current = null;
    }
    if (arrivalBrakeTimeoutRef.current) {
      clearTimeout(arrivalBrakeTimeoutRef.current);
      arrivalBrakeTimeoutRef.current = null;
    }
    if (finishCallbackTimeoutRef.current) {
      clearTimeout(finishCallbackTimeoutRef.current);
      finishCallbackTimeoutRef.current = null;
    }
    if (carAnimFrameRef.current) {
      cancelAnimationFrame(carAnimFrameRef.current);
      carAnimFrameRef.current = null;
    }

    stopAllSounds();

    if (carMarkerRef.current) {
      setCarState({ headlights: false, brakelights: false, rumble: false, puffing: false });
      carMarkerRef.current.remove();
      carMarkerRef.current = null;
    }

    setIsCarDriving(false);
    exitFocusMode(400);

    const map = mapRef.current;
    if (isMapReady(map)) {
      const routePreviewSource = map.getSource('edges-route-preview-source');
      if (routePreviewSource) {
        routePreviewSource.setData({ type: 'FeatureCollection', features: [] });
      }
      const routeDrawnSource = map.getSource('edges-route-drawn-source');
      if (routeDrawnSource && activePickupIdRef.current !== 'ALL' && activePickupIdRef.current !== null) {
        routeDrawnSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [exitFocusMode, setCarState]);

  // Main 3-Phase Vehicle Animation Engine
  const animateVehicle = useCallback(() => {
    const map = mapRef.current;
    if (!isMapReady(map)) return false;

    ensureGraphLayers(map);
    const currentPathNodes = activePathNodesRef.current || [];
    if (currentPathNodes.length < 2) return false;

    const nMap = nodesMapRef.current || {};
    const currentEdges = edgesRef.current || [];

    // Stitch the full route polyline by concatenating getEdgePolyline(...)
    // oriented forward along path_nodes across every hop of the winning path.
    const fullRouteCoords = [];
    for (let i = 0; i < currentPathNodes.length - 1; i++) {
      const uId = currentPathNodes[i];
      const vId = currentPathNodes[i + 1];
      const u = nMap[uId];
      const v = nMap[vId];
      if (!u || !v || u.lat == null || u.lng == null || v.lat == null || v.lng == null) {
        continue;
      }
      const edge = currentEdges.find(
        (e) => (e.source_id === uId && e.target_id === vId) || (e.source_id === vId && e.target_id === uId)
      );
      const hopCoords = getEdgePolyline(edge || { id: `${uId}->${vId}` }, u, v);
      if (hopCoords && hopCoords.length > 0) {
        if (fullRouteCoords.length === 0) {
          fullRouteCoords.push(...hopCoords);
        } else {
          // Avoid duplicate junction point
          fullRouteCoords.push(...hopCoords.slice(1));
        }
      }
    }

    if (fullRouteCoords.length < 2) return false;

    const routeDrawnSource = map.getSource('edges-route-drawn-source');
    const thisPickupId = activePickupIdRef.current;
    const startNodeId = currentPathNodes[0];
    const destNodeId = currentPathNodes[currentPathNodes.length - 1];

    // Clear previous timeouts & rAF cleanly
    if (ignitionTimeoutRef.current) {
      clearTimeout(ignitionTimeoutRef.current);
      ignitionTimeoutRef.current = null;
    }
    if (idleSoundTimeoutRef.current) {
      clearTimeout(idleSoundTimeoutRef.current);
      idleSoundTimeoutRef.current = null;
    }
    if (coolDownTimeoutRef.current) {
      clearTimeout(coolDownTimeoutRef.current);
      coolDownTimeoutRef.current = null;
    }
    if (arrivalBrakeTimeoutRef.current) {
      clearTimeout(arrivalBrakeTimeoutRef.current);
      arrivalBrakeTimeoutRef.current = null;
    }
    if (finishCallbackTimeoutRef.current) {
      clearTimeout(finishCallbackTimeoutRef.current);
      finishCallbackTimeoutRef.current = null;
    }
    if (carAnimFrameRef.current) {
      cancelAnimationFrame(carAnimFrameRef.current);
      carAnimFrameRef.current = null;
    }

    stopAllSounds();

    // Node & Delivery Telemetry Data
    const startNode = nMap[startNodeId];
    const destNode = nMap[destNodeId];
    const pickupName = getCleanLandmarkName(startNode) || startNodeId;
    const destName = getCleanLandmarkName(destNode) || destNodeId;
    const alloc = allocationsMapRef.current[thisPickupId];
    const fallback = DEFAULT_NODE_DESTINATIONS[thisPickupId] || {};
    const weightKg = startNode?.weight_kg ?? alloc?.weight_kg ?? fallback.weight ?? 12;
    const wasteCategory = startNode?.waste_type ?? alloc?.waste_type ?? fallback.waste ?? 'Batteries';
    const activeMetric = metricRef.current || 'time';
    const unit = activeMetric === 'time' ? 'min' : 'km';

    let computedCost = 0;
    for (let i = 0; i < currentPathNodes.length - 1; i++) {
      const u = currentPathNodes[i];
      const v = currentPathNodes[i + 1];
      const edge = currentEdges.find(
        (e) => (e.source_id === u && e.target_id === v) || (e.source_id === v && e.target_id === u)
      );
      if (edge) {
        if (activeMetric === 'time') {
          computedCost += (edge.base_time_min || 0) * (edge.traffic_factor || 1.0);
        } else {
          computedCost += edge.base_distance_km || 0;
        }
      }
    }
    const totalCost =
      (activeMetric === 'time' ? alloc?.total_time_min : alloc?.total_distance_km) ??
      (computedCost > 0 ? computedCost : (activeMetric === 'time' ? fallback.time : fallback.dist) ?? 15);

    // Instantiate or place Mr. Bean's Mini Cooper
    let carMarker = carMarkerRef.current;
    if (!carMarker) {
      const carEl = document.createElement('div');
      carEl.className = 'vehicle-marker-wrapper';
      carEl.style.zIndex = '15';
      carEl.style.position = 'absolute';
      carEl.style.pointerEvents = 'none';
      carEl.style.willChange = 'transform';
      carEl.style.transition = 'none !important';
      carEl.innerHTML = MR_BEAN_MINI_COOPER_HTML;

      carMarker = new maplibregl.Marker({
        element: carEl,
        anchor: 'center',
        subpixelPositioning: false,
      })
        .setLngLat(fullRouteCoords[0])
        .addTo(map);

      carMarkerRef.current = carMarker;
    } else {
      carMarker.getElement().style.display = 'block';
      carMarker.setLngLat(fullRouteCoords[0]);
    }

    setIsCarDriving(true);

    // Initial slice & angle
    const startSlice = slicePolylineByProgress(fullRouteCoords, 0);
    cameraBearingRef.current = startSlice.bearingDeg;
    const miniInner = carMarkerRef.current?.getElement()?.querySelector('#eco-mr-bean-mini');
    if (miniInner) {
      miniInner.style.transform = `rotate(${startSlice.angleDeg - cameraBearingRef.current}deg)`;
    }

    if (routeDrawnSource) {
      routeDrawnSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [fullRouteCoords[0], fullRouteCoords[0]],
            },
          },
        ],
      });
    }

    // Ensure edges-route-preview-source exists and is populated with full straight fullRouteCoords
    const routePreviewSource = map.getSource('edges-route-preview-source');
    if (routePreviewSource) {
      routePreviewSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: fullRouteCoords,
            },
          },
        ],
      });
    }

    // =========================================================================
    // PHASE 1 — Ignition & 1-Second Warm-Up (1000ms stationary at Pickup)
    // =========================================================================
    enterFocusMode(startNodeId, destNodeId, fullRouteCoords);
    setCarState({ headlights: true, brakelights: false, rumble: true, puffing: true });
    playCarIgnition();

    // Settle into soft idle purr at ~480ms
    idleSoundTimeoutRef.current = setTimeout(() => {
      idleSoundTimeoutRef.current = null;
      startCarIdle();
    }, 480);

    // Telemetry Pill: Phase 1 Starting engine...
    if (telemetryPillRef.current) {
      telemetryPillRef.current.className =
        'telemetry-pill-container pointer-events-none select-none absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur border border-slate-200/90 shadow-lg rounded-full px-4 py-2 transition-all duration-300 text-slate-800';
      telemetryPillRef.current.style.display = 'block';
      void telemetryPillRef.current.offsetWidth;
      telemetryPillRef.current.style.opacity = '1';
      telemetryPillRef.current.style.transform = 'translate(-50%, 0)';
      telemetryPillRef.current.innerHTML = `
        <div class="flex items-center gap-2 text-xs font-semibold">
          <span class="w-2.5 h-2.5 rounded-full bg-lime-500 animate-pulse shrink-0"></span>
          <span class="text-slate-900 font-bold">${pickupName} → ${destName}</span>
          <span class="text-slate-300">•</span>
          <span class="text-slate-600 font-mono text-[11.5px]">Starting engine…</span>
        </div>
      `;
    }

    // =========================================================================
    // PHASE 2 — Slower, Smooth Cruise Along the Emerald Route
    // =========================================================================
    ignitionTimeoutRef.current = setTimeout(() => {
      ignitionTimeoutRef.current = null;

      const speed = playbackSpeedRef.current || 1;
      const baseDuration1x = Math.max(3200, Math.min(6500, 1800 + (currentPathNodes.length - 1) * 1550));
      const cruiseDuration = baseDuration1x / Math.max(0.5, Math.min(3, speed));

      // Audio transition: idle purr -> driving hum
      stopCarIdle(0.05);
      startCarHum(speed);

      // Stop idle rumble, keep subtle takeoff exhaust wisps
      setCarState({ headlights: true, brakelights: false, rumble: false, puffing: true });

      // Telemetry Pill: Phase 2 Countdown
      if (telemetryPillRef.current) {
        telemetryPillRef.current.innerHTML = `
          <div class="flex items-center gap-2 text-xs font-semibold">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span class="text-slate-900 font-bold">${pickupName} → ${destName}</span>
            <span class="text-slate-300">•</span>
            <span class="telemetry-countdown text-emerald-700 font-mono font-bold text-[11.5px]">${totalCost.toFixed(1)} ${unit} left</span>
          </div>
        `;
      }

      let brakeTriggered = false;
      const cruiseStartTime = performance.now();

      const stepDrive = (currentTime) => {
        const elapsed = currentTime - cruiseStartTime;
        const rawProgress = Math.min(1, elapsed / cruiseDuration);
        // easeInOutSine for gentle acceleration and braking
        const progress = -(Math.cos(Math.PI * rawProgress) - 1) / 2;

        // Dissipate exhaust puffs after initial 25% of cruise
        if (rawProgress > 0.25) {
          setCarState({ puffing: false });
        }

        const { partialCoords, tipCoord, angleDeg, bearingDeg } = slicePolylineByProgress(fullRouteCoords, progress);

        if (carMarkerRef.current) {
          carMarkerRef.current.setLngLat(tipCoord);
        }

        // Smooth 2.5D Chase Camera: follow Mr. Bean's Mini Cooper along its route
        if (map && isFocusModeRef.current) {
          // Smooth exponential dampening for camera bearing so turns feel cinematic and silky smooth
          let diff = ((bearingDeg - cameraBearingRef.current + 540) % 360) - 180;
          cameraBearingRef.current += diff * 0.045;

          map.jumpTo({
            center: tipCoord,
            pitch: 45,
            bearing: cameraBearingRef.current,
          });
        }

        const currentInner = carMarkerRef.current?.getElement()?.querySelector('#eco-mr-bean-mini');
        if (currentInner) {
          currentInner.style.transform = `rotate(${angleDeg - cameraBearingRef.current}deg)`;
        }

        // Smoothly paint winning route directly behind the car in real time
        if (routeDrawnSource) {
          routeDrawnSource.setData({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: partialCoords.length >= 2 ? partialCoords : [fullRouteCoords[0], tipCoord],
                },
              },
            ],
          });
        }

        // Live ticking countdown updated smoothly with zero React re-renders
        if (telemetryPillRef.current) {
          const cd = telemetryPillRef.current.querySelector('.telemetry-countdown');
          if (cd) {
            const remaining = Math.max(0, totalCost * (1 - progress));
            cd.textContent = `${remaining.toFixed(1)} ${unit} left`;
          }
        }

        // At 85% of total path distance, switch rear red brake lights ON + deceleration swoosh
        if (rawProgress >= 0.85 && !brakeTriggered) {
          brakeTriggered = true;
          setCarState({ headlights: true, brakelights: true, rumble: false, puffing: false });
          stopCarHum();
          playCarBrake();
        }

        if (rawProgress < 1) {
          carAnimFrameRef.current = requestAnimationFrame(stepDrive);
        } else {
          // =========================================================================
          // PHASE 3 — Arrival & 1-Second Engine Cool-Down (1000ms at Destination)
          // =========================================================================
          carAnimFrameRef.current = null;
          stopCarHum();

          if (!brakeTriggered) {
            brakeTriggered = true;
            playCarBrake();
          }

          if (carMarkerRef.current) {
            carMarkerRef.current.setLngLat(fullRouteCoords[fullRouteCoords.length - 1]);
          }
          if (map && isFocusModeRef.current) {
            map.jumpTo({
              center: fullRouteCoords[fullRouteCoords.length - 1],
              pitch: 45,
              bearing: cameraBearingRef.current,
            });
          }
          if (routeDrawnSource) {
            routeDrawnSource.setData({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: fullRouteCoords,
                  },
                },
              ],
            });
          }

          // Trigger Centre Arrival Ripple on destination Recycling Centre marker
          const destMarker = nodeMarkersRef.current[destNodeId];
          if (destMarker) {
            const destEl = destMarker.getElement();
            const existingRipple = destEl.querySelector('.centre-arrival-ripple');
            if (existingRipple) existingRipple.remove();
            const rippleEl = document.createElement('div');
            rippleEl.className = 'centre-arrival-ripple';
            destEl.appendChild(rippleEl);
          }

          // Play soft two-note emerald arrival chime
          playArrivalChime();

          // Settle engine into soft idle purr & rumble
          startCarIdle();
          setCarState({ headlights: true, brakelights: true, rumble: true, puffing: false });

          // Flip Telemetry Pill to emerald Delivered state
          if (telemetryPillRef.current) {
            telemetryPillRef.current.className =
              'telemetry-pill-container pointer-events-none select-none absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-lg rounded-full px-4 py-2 transition-all duration-300';
            telemetryPillRef.current.innerHTML = `
              <div class="flex items-center gap-2 text-xs font-bold text-emerald-900">
                <svg class="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Delivered</span>
                <span class="text-emerald-400 font-normal">•</span>
                <span class="font-semibold text-emerald-700 font-mono text-[11.5px]">${weightKg} kg ${wasteCategory} Recycled</span>
              </div>
            `;
          }

          // Keep brake lights glowing softly for ~600ms, then turn brake lights OFF
          arrivalBrakeTimeoutRef.current = setTimeout(() => {
            arrivalBrakeTimeoutRef.current = null;
            setCarState({ brakelights: false });
          }, 600);

          // Cool-down for deliberate 1000ms: shut off engine, turn lights off, exit Focus Mode
          coolDownTimeoutRef.current = setTimeout(() => {
            coolDownTimeoutRef.current = null;

            playEngineStop();
            stopCarIdle();
            setCarState({ headlights: false, brakelights: false, rumble: false, puffing: false });

            // Smoothly exit Spotlight Focus Mode (550ms transition restoring camera & full network)
            exitFocusMode(550);

            // After exit transition completes (~550ms), finish drive and invoke onVehicleFinish
            finishCallbackTimeoutRef.current = setTimeout(() => {
              finishCallbackTimeoutRef.current = null;
              setIsCarDriving(false);
              onVehicleFinishRef.current?.(thisPickupId);
            }, 550);
          }, 1000);
        }
      };

      carAnimFrameRef.current = requestAnimationFrame(stepDrive);
    }, 1000);

    return true;
  }, [ensureGraphLayers, enterFocusMode, exitFocusMode, setCarState]);

  // Automatic Car Drive Trigger on route_confirm & Instant Cleanup on tab switch / reset / prev step
  const isConfirm = step.event_type === 'route_confirm';
  const currentStepNum = step.step_index;

  useEffect(() => {
    const isSinglePickupConfirm = activePickupId && isConfirm && activePathNodes.length >= 2;
    const currentStepKey = `${activePickupId}-${currentStepNum || 'confirm'}-${(activePathNodes || []).join(',')}`;

    if (isSinglePickupConfirm) {
      if (lastDrivenStepKeyRef.current !== currentStepKey) {
        const started = animateVehicle();
        if (started) {
          lastDrivenStepKeyRef.current = currentStepKey;
        }
      }
    } else {
      // Clear/hide the car marker immediately whenever switching pickup tabs, resetting, or stepping backward before route_confirm
      lastDrivenStepKeyRef.current = null;
      cleanupVehicleAndFocusMode();
    }
  }, [activePickupId, isConfirm, currentStepNum, activePathNodes, animateVehicle, cleanupVehicleAndFocusMode, isMapLoaded]);

  // Instant Pause / Stop All watcher to cancel vehicle drive immediately
  const prevIsRunAllRef = useRef(isRunAll);
  const prevIsPlayingRef = useRef(isPlaying);
  useEffect(() => {
    if (prevIsRunAllRef.current && !isRunAll && isCarDrivingRef.current) {
      cleanupVehicleAndFocusMode();
    }
    prevIsRunAllRef.current = isRunAll;
  }, [isRunAll, cleanupVehicleAndFocusMode]);

  useEffect(() => {
    if (prevIsPlayingRef.current && !isPlaying && !isRunAll && isCarDrivingRef.current) {
      cleanupVehicleAndFocusMode();
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, isRunAll, cleanupVehicleAndFocusMode]);

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
    const localMatches = NCR_LOCAL_PLACES.filter((p) => p.name.toLowerCase().includes(lower));
    setSearchResults(localMatches);
    setSearchDropdownOpen(true);

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

  useEffect(() => {
    if (mapRef.current) {
      const timer = setTimeout(() => {
        mapRef.current.resize();
        fitAllNodes(mapRef.current, 350);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen, fitAllNodes]);

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
          className={`absolute bottom-5 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-lg flex items-center gap-2 backdrop-blur-md animate-in fade-in transition-all ${
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
      <div className="absolute top-3 left-3 right-3 z-40 flex flex-wrap items-center justify-between gap-2 p-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm text-xs select-none">
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
                  <span className="text-emerald-600">📍</span>
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
            <Clock className={`w-3.5 h-3.5 ${metric === 'time' ? 'text-emerald-600' : 'text-slate-500'}`} />
            <span>Travel Time (min)</span>
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
            <Route className={`w-3.5 h-3.5 ${metric === 'distance' ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span>Distance (km)</span>
          </button>
        </div>

        {/* Right: Working Toolbar Buttons (Inspect, Pickup, Centre, Connect Road, Fullscreen) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleSelectMode('inspect')}
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
            onClick={() => handleSelectMode('add_pickup')}
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
            onClick={() => handleSelectMode('add_centre')}
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
            onClick={() => handleSelectMode('connect_road')}
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
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-300 shadow-md text-xs">
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
              <div className="w-[1px] h-3.5 bg-slate-200 mx-1" />
              <span className="text-slate-600 font-medium">Streams:</span>
              <div className="flex items-center gap-1">
                {ALL_STREAMS.map((stream) => {
                  const isSelected = selectedStreams.includes(stream);
                  return (
                    <button
                      key={stream}
                      type="button"
                      onClick={() => handleToggleStream(stream)}
                      title={isSelected ? `Remove ${stream}` : `Accept ${stream}`}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all ${
                        isSelected
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs'
                          : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200/70'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-emerald-600" />}
                      <span>{stream}</span>
                    </button>
                  );
                })}
              </div>
              <span className="text-slate-400 text-[11px] ml-1">(Click map to place)</span>
            </>
          )}

          {mode === 'connect_road' && (
            <span className="font-bold text-indigo-700">
              {connectSourceNode
                ? `From "${getNodeDisplayLabel(connectSourceNode)}" → Click 2nd node`
                : 'Click 1st node to connect straight road'}
            </span>
          )}

          <button
            type="button"
            onClick={() => handleSelectMode('inspect')}
            className="ml-2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main MapLibre Map Canvas Container */}
      <div className="relative w-full h-full z-0 isolate flex-1">
        <div ref={mapContainerRef} className="w-full h-full min-h-[500px]" />
      </div>

      {/* Bottom Right Floating Controls */}
      <div className="absolute bottom-8 right-4 z-30 flex flex-col items-center gap-1.5 p-1 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-md">
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

      {/* Subtle Replay Drive Button (visible ONLY when idle on a completed route) */}
      {activePickupId && isConfirm && activePathNodes.length >= 2 && !isPlaying && !isRunAll && !isCarDriving && (
        <div className="absolute bottom-8 left-4 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              animateVehicle();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 text-white text-xs font-medium shadow-sm hover:bg-slate-800 backdrop-blur-md transition-all border border-slate-700/50"
          >
            <Play className="w-3 h-3 text-lime-400 fill-lime-400" />
            <span>Replay Drive</span>
          </button>
        </div>
      )}

      {/* 2.5D Spotlight Focus Mode Live Delivery Telemetry Pill */}
      <div
        ref={telemetryPillRef}
        className="telemetry-pill-container pointer-events-none select-none absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur border border-slate-200/90 shadow-lg rounded-full px-4 py-2 transition-all duration-300"
        style={{
          display: 'none',
          opacity: 0,
          transform: 'translate(-50%, 12px)',
        }}
      />

      {/* Clean Attribution Pill */}
      <div className="absolute bottom-2 right-4 z-20 px-2 py-0.5 rounded-full bg-white/70 backdrop-blur-xs text-[9.5px] text-slate-500 font-medium pointer-events-none">
        MapLibre • OpenFreeMap
      </div>
    </div>
  );
}
