# EcoRoute — E-Waste Collection Route Optimisation Platform

**EcoRoute** is a production-ready, full-stack geospatial logistics platform designed to optimize municipal electronic waste (e-waste) collection and routing across urban networks (Delhi NCR pre-seeded network). Powered by **Dijkstra’s Algorithm** (via binary min-heaps) and **Greedy Capacity-Constrained Allocation**, EcoRoute balances road network disruptions (traffic congestion, arterial roadblocks) with specialized material processing certifications and facility volume limits.

---

## Key Highlights

- **Dijkstra's Algorithm Engine:** Custom implementation using Python's `heapq` min-heap achieving $O((V + E) \log V)$ time complexity with full priority queue tracing.
- **Greedy Capacity-Constrained Allocation:** Iterative heuristic evaluating candidate facilities by shortest effective distance, certifying material categories, and enforcing residual capacity limits.
- **Global Optimal Combinatorial Benchmark:** Built-in Branch-and-Bound DFS solver computing the mathematically global optimal assignment to benchmark Greedy performance, throughput (kg), and execution latency (ms).
- **Interactive Geospatial Simulator:** Interactive Leaflet workspace using CartoDB Positron light tiles, custom SVG `L.divIcon` markers, weighted road graph overlays with clickable distance pills, and real-street OSRM polylines.
- **Live Disruption Simulator:** Click any road edge or distance pill to toggle **Normal (1.0×)**, **Heavy Traffic (2.5×)**, or **Roadblocks (Closed)**, triggering immediate real-time Dijkstra shortest-path recalculation and vehicle rerouting.
- **Animated Vehicle Movement:** Rotates vehicle headings along polyline bearings and visualizes real-time facility capacity drops.
- **Single-Service Render Deployment:** Unified FastAPI backend serving the pre-compiled React 18 SPA fallback and REST API endpoints.

---

## E-Waste Stream Categories

| Category | Accent Color | Hex Code | Typical Stream Materials |
|---|---|---|---|
| **Batteries** | Amber | `#D97706` | Lithium-ion cells, UPS lead-acid, automotive packs |
| **Computers** | Violet | `#7C3AED` | Desktops, laptops, server blades, high-density PCBs |
| **Smartphones** | Sky | `#0284C7` | Mobile phones, tablets, handheld wearables |
| **Appliances** | Teal | `#0D9488` | White goods, refrigerators, microwaves, AC compressors |

---

## Architecture & Tech Stack

```
EcoRoute/
├── render.yaml              # Render single-service configuration
├── README.md                # Platform documentation
├── backend/
│   ├── requirements.txt     # FastAPI, Uvicorn, Pydantic v2
│   ├── main.py              # REST API, lifespan database seeding, SPA fallback
│   ├── database.py          # SQLite schema (row_factory), CRUD, Delhi NCR seeder
│   ├── algorithms.py        # Dijkstra (heapq), Greedy allocation, DFS benchmark, Haversine
│   └── models.py            # Pydantic v2 data models
└── frontend/
    ├── package.json         # React 18, Vite, Tailwind, Leaflet, Recharts, Lucide
    ├── vite.config.js       # Vite dev proxy (/api -> http://127.0.0.1:8000)
    ├── tailwind.config.js   # Civic-logistics design system & category colors
    ├── index.html           # Leaflet CSS, JetBrains Mono font
    └── src/
        ├── App.jsx          # Top navbar, Router, Concepts drawer
        ├── api/client.js    # Centralized REST API client
        ├── utils/osrm.js    # OSRM street route fetcher (3s timeout fallback)
        ├── components/
        │   ├── MapCanvas.jsx        # Leaflet map, Carto tiles, SVG divIcons, animated vehicle
        │   ├── InspectorPanel.jsx   # Playback controls, Greedy checklist, Min-Heap strip
        │   ├── DisruptionModal.jsx  # Interactive road edge editor (traffic/roadblock)
        │   └── ConceptsModal.jsx    # Key Concepts & Should-Know Notes drawer
        └── pages/
            ├── OverviewPage.jsx     # Landing dashboard, live KPIs, workflow cards
            ├── DispatchPage.jsx     # Centerpiece optimizer & disruption simulator
            ├── SchedulePage.jsx     # Consignment registration form + pin-drop map
            └── AnalyticsPage.jsx    # Greedy vs Optimal benchmark & facility management
```

---

## REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status |
| `GET` | `/api/graph` | Returns all network nodes and road edges |
| `POST` | `/api/pickups` | Creates a new pickup consignment (auto-connects to 2 nearest nodes) |
| `PUT` | `/api/pickups/{id}` | Updates pickup attributes (weight, category, coordinates) |
| `DELETE`| `/api/pickups/{id}` | Deletes pickup and attached edges |
| `POST` | `/api/centres` | Registers a new recycling facility (auto-connects to 2 nearest nodes) |
| `PUT` | `/api/centres/{id}` | Updates centre max capacity or accepted waste streams |
| `DELETE`| `/api/centres/{id}` | Deletes recycling centre |
| `POST` | `/api/edges` | Connects two nodes with base distance |
| `PUT` | `/api/edges/{id}` | Updates edge distance, traffic multiplier, or roadblock status |
| `DELETE`| `/api/edges/{id}` | Deletes road edge |
| `GET` | `/api/optimize?order=default` | Runs Dijkstra + Greedy + Global Optimal benchmark |
| `POST` | `/api/reset-demo` | Resets SQLite database to default Delhi NCR network |

---

## Local Development Guide

### 1. Backend Setup (FastAPI)
```bash
cd backend
python -m pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Backend API will be accessible at: `http://127.0.0.1:8000` (Docs: `http://127.0.0.1:8000/docs`).

### 2. Frontend Setup (React 18 + Vite)
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Frontend development server will open at: `http://localhost:5173`.
API calls to `/api` are automatically proxied to `http://127.0.0.1:8000`.

### 3. Production Build & Verification
```bash
cd frontend
npm run build
cd ../backend
python -m uvicorn main:app --port 8000
```
FastAPI will serve the compiled React SPA directly from `../frontend/dist`.

---

## Render Deployment

EcoRoute is pre-configured for single-service deployment via `render.yaml`.
In your Render dashboard:
1. Select **New** → **Blueprint**.
2. Connect your repository.
3. Render automatically detects `render.yaml`, runs the build command, and launches Uvicorn.
