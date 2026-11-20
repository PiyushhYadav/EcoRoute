import os
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from models import (
    NodeModel,
    PickupCreate,
    PickupUpdate,
    CentreCreate,
    CentreUpdate,
    EdgeModel,
    EdgeCreate,
    EdgeUpdate,
    GraphResponse,
    OptimizationResponse,
)
import database as db
import algorithms as algo

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB schema & seed default city if empty
    db.init_db()
    db.seed_default_delhi_data(force=False)
    yield

app = FastAPI(
    title="EcoRoute API",
    description="E-Waste Collection Route Optimisation Platform powered by Dijkstra's Algorithm & Greedy Allocation",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configuration for Vite local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- REST API Endpoints -----------------

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app": "EcoRoute",
        "system": "E-Waste Delhi NCR Weighted-Graph Visualizer",
        "version": "2.0.0"
    }

@app.get("/api/graph", response_model=GraphResponse)
def get_graph():
    nodes = db.get_all_nodes()
    edges = db.get_all_edges()
    return {"nodes": nodes, "edges": edges}

# --- Pickups ---

@app.post("/api/pickups", response_model=NodeModel, status_code=status.HTTP_201_CREATED)
def create_pickup(pickup: PickupCreate):
    all_nodes = db.get_all_nodes()
    existing_p_ids = [n["id"] for n in all_nodes if n["id"].startswith("P") and n["id"][1:].isdigit()]
    if existing_p_ids:
        max_idx = max(int(pid[1:]) for pid in existing_p_ids)
        new_id = f"P{max_idx + 1}"
    else:
        new_id = f"P_{uuid.uuid4().hex[:6]}"

    x = pickup.x
    y = pickup.y
    lat = pickup.lat
    lng = pickup.lng

    if x is None or y is None:
        if lat is not None and lng is not None:
            x, y = db.xy_from_latlng(lat, lng)
        else:
            x, y = 300.0, 300.0
    if lat is None or lng is None:
        lat, lng = db.latlng_from_xy(x, y)

    node_data = {
        "id": new_id,
        "name": pickup.name,
        "kind": "pickup",
        "x": x,
        "y": y,
        "lat": lat,
        "lng": lng,
        "waste_type": pickup.waste_type,
        "weight_kg": pickup.weight_kg,
        "max_capacity_kg": 0.0,
        "accepted_types": [],
        "donor_name": pickup.donor_name,
        "status": "pending"
    }
    created = db.create_node(node_data)
    return created

@app.put("/api/pickups/{node_id}", response_model=NodeModel)
def update_pickup(node_id: str, updates: PickupUpdate):
    existing = db.get_node_by_id(node_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Pickup node '{node_id}' not found.")
    
    update_dict = updates.model_dump(exclude_unset=True)
    if ("x" in update_dict or "y" in update_dict) and ("lat" not in update_dict or "lng" not in update_dict):
        x = update_dict.get("x", existing["x"])
        y = update_dict.get("y", existing["y"])
        lat, lng = db.latlng_from_xy(x, y)
        update_dict["lat"] = lat
        update_dict["lng"] = lng

    updated = db.update_node(node_id, update_dict)
    return updated

@app.delete("/api/pickups/{node_id}")
def delete_pickup(node_id: str):
    existing = db.get_node_by_id(node_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Pickup node '{node_id}' not found.")
    db.delete_node(node_id)
    return {"message": f"Pickup '{node_id}' and attached road edges deleted successfully."}

# --- Centres ---

@app.post("/api/centres", response_model=NodeModel, status_code=status.HTTP_201_CREATED)
def create_centre(centre: CentreCreate):
    all_nodes = db.get_all_nodes()
    existing_r_ids = [n["id"] for n in all_nodes if n["id"].startswith("R") and n["id"][1:].isdigit()]
    if existing_r_ids:
        max_idx = max(int(rid[1:]) for rid in existing_r_ids)
        new_id = f"R{max_idx + 1}"
    else:
        new_id = f"R_{uuid.uuid4().hex[:6]}"

    x = centre.x
    y = centre.y
    lat = centre.lat
    lng = centre.lng

    if x is None or y is None:
        if lat is not None and lng is not None:
            x, y = db.xy_from_latlng(lat, lng)
        else:
            x, y = 600.0, 400.0
    if lat is None or lng is None:
        lat, lng = db.latlng_from_xy(x, y)

    node_data = {
        "id": new_id,
        "name": centre.name,
        "kind": "centre",
        "x": x,
        "y": y,
        "lat": lat,
        "lng": lng,
        "waste_type": None,
        "weight_kg": 0.0,
        "max_capacity_kg": centre.max_capacity_kg,
        "accepted_types": centre.accepted_types,
        "donor_name": None,
        "status": "active"
    }
    created = db.create_node(node_data)
    return created

@app.put("/api/centres/{node_id}", response_model=NodeModel)
def update_centre(node_id: str, updates: CentreUpdate):
    existing = db.get_node_by_id(node_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Recycling centre '{node_id}' not found.")
    
    update_dict = updates.model_dump(exclude_unset=True)
    if ("x" in update_dict or "y" in update_dict) and ("lat" not in update_dict or "lng" not in update_dict):
        x = update_dict.get("x", existing["x"])
        y = update_dict.get("y", existing["y"])
        lat, lng = db.latlng_from_xy(x, y)
        update_dict["lat"] = lat
        update_dict["lng"] = lng

    updated = db.update_node(node_id, update_dict)
    return updated

@app.delete("/api/centres/{node_id}")
def delete_centre(node_id: str):
    existing = db.get_node_by_id(node_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Centre '{node_id}' not found.")
    db.delete_node(node_id)
    return {"message": f"Centre '{node_id}' and attached road edges deleted successfully."}

# --- Edges ---

@app.post("/api/edges", response_model=EdgeModel, status_code=status.HTTP_201_CREATED)
def create_edge(edge: EdgeCreate):
    n1 = db.get_node_by_id(edge.source_id)
    n2 = db.get_node_by_id(edge.target_id)
    if not n1 or not n2:
        raise HTTPException(status_code=400, detail="Both source and target nodes must exist.")
    
    created = db.create_edge(edge.model_dump())
    return created

@app.put("/api/edges/{edge_id}", response_model=EdgeModel)
@app.patch("/api/edges/{edge_id}", response_model=EdgeModel)
def update_edge(edge_id: str, updates: EdgeUpdate):
    existing = db.get_edge_by_id(edge_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Road edge '{edge_id}' not found.")
    
    update_dict = updates.model_dump(exclude_unset=True)
    updated = db.update_edge(edge_id, update_dict)
    return updated

@app.delete("/api/edges/{edge_id}")
def delete_edge(edge_id: str):
    existing = db.get_edge_by_id(edge_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Road edge '{edge_id}' not found.")
    db.delete_edge(edge_id)
    return {"message": f"Road edge '{edge_id}' deleted successfully."}

# --- Optimizer ---

@app.get("/api/optimize", response_model=OptimizationResponse)
def optimize(
    order: str = Query("default", pattern="^(default|heaviest_first)$"),
    metric: str = Query("time", pattern="^(time|distance)$")
):
    nodes = db.get_all_nodes()
    edges = db.get_all_edges()

    result = algo.run_optimization(nodes, edges, order=order, metric=metric)
    result["graph"] = {"nodes": nodes, "edges": edges}
    return result

# --- Reset Demo Data ---

@app.post("/api/reset-demo")
def reset_demo():
    db.init_db()
    db.seed_default_delhi_data(force=True)
    nodes = db.get_all_nodes()
    edges = db.get_all_edges()
    return {
        "message": "Demo data successfully reset to redesigned Delhi NCR scenario.",
        "nodes_count": len(nodes),
        "edges_count": len(edges)
    }

# --- Static Frontend Serving for Render Production ---
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")
