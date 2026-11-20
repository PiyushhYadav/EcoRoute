import sys
from pathlib import Path
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from main import app
import database as db

client = TestClient(app)

def test_api():
    print("Testing /api/health...")
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    print("Testing POST /api/reset-demo...")
    res = client.post("/api/reset-demo")
    assert res.status_code == 200
    data = res.json()
    assert data["nodes_count"] == 11
    assert data["edges_count"] == 18

    print("Testing GET /api/graph...")
    res = client.get("/api/graph")
    assert res.status_code == 200
    graph = res.json()
    assert len(graph["nodes"]) == 11
    assert len(graph["edges"]) == 18
    # Check canvas coordinates
    for n in graph["nodes"]:
        assert "x" in n and "y" in n
        assert n["x"] is not None and n["y"] is not None
    # Check dual weights
    for e in graph["edges"]:
        assert "base_distance_km" in e and "base_time_min" in e
        assert "effective_distance_km" in e and "effective_time_min" in e

    print("Testing GET /api/optimize?metric=time...")
    res = client.get("/api/optimize?order=default&metric=time")
    assert res.status_code == 200
    time_opt = res.json()
    assert time_opt["metric"] == "time"
    assert len(time_opt["pickup_walkthroughs"]) == 4
    # P1 should take P1 -> J3 -> R2 in time mode (17 min < 26 min)
    p1 = next(p for p in time_opt["pickup_walkthroughs"] if p["pickup_id"] == "P1")
    assert p1["path_nodes"] == ["P1", "J3", "R2"]
    assert p1["total_cost"] == 17.0

    print("Testing GET /api/optimize?metric=distance...")
    res = client.get("/api/optimize?order=default&metric=distance")
    assert res.status_code == 200
    dist_opt = res.json()
    assert dist_opt["metric"] == "distance"
    # P1 should take direct P1 -> R2 in distance mode (8.0 km < 10.0 km)
    p1_dist = next(p for p in dist_opt["pickup_walkthroughs"] if p["pickup_id"] == "P1")
    assert p1_dist["path_nodes"] == ["P1", "R2"]
    assert p1_dist["total_cost"] == 8.0

    print("Testing POST /api/pickups with lat, lng...")
    res = client.post("/api/pickups", json={
        "name": "Saket District",
        "lat": 28.5244,
        "lng": 77.2185,
        "waste_type": "Smartphones",
        "weight_kg": 10.0,
        "donor_name": "Saket Electronics"
    })
    assert res.status_code == 201
    created_p = res.json()
    assert abs(created_p["lat"] - 28.5244) < 0.001
    assert abs(created_p["lng"] - 77.2185) < 0.001
    assert "x" in created_p and "y" in created_p

    print("Testing POST /api/centres with lat, lng...")
    res = client.post("/api/centres", json={
        "name": "Noida Sector 62 Centre",
        "lat": 28.6280,
        "lng": 77.3649,
        "max_capacity_kg": 35.0,
        "accepted_types": ["Batteries", "Smartphones", "Computers"]
    })
    assert res.status_code == 201
    created_c = res.json()
    assert abs(created_c["lat"] - 28.6280) < 0.001
    assert abs(created_c["lng"] - 77.3649) < 0.001

    print("Testing POST /api/edges...")
    res = client.post("/api/edges", json={
        "source_id": created_p["id"],
        "target_id": created_c["id"],
        "traffic_multiplier": 1.0,
        "is_blocked": 0
    })
    assert res.status_code == 201
    created_e = res.json()
    assert created_e["base_distance_km"] > 0
    assert created_e["base_time_min"] > 0

    print("Testing PATCH /api/edges/:id...")
    res = client.patch(f"/api/edges/{created_e['id']}", json={
        "traffic_multiplier": 2.5,
        "is_blocked": 0
    })
    assert res.status_code == 200
    updated_e = res.json()
    assert updated_e["traffic_multiplier"] == 2.5
    assert updated_e["effective_distance_km"] == round(created_e["base_distance_km"] * 2.5, 1)

    print("Testing PATCH /api/nodes/P1 (pickup)...")
    res = client.patch("/api/nodes/P1", json={
        "name": "Janakpuri West Updated",
        "waste_category": "Smartphones",
        "weight_kg": 15.0
    })
    assert res.status_code == 200
    p1_updated = res.json()
    assert p1_updated["name"] == "Janakpuri West Updated"
    assert p1_updated["waste_type"] == "Smartphones"
    assert p1_updated["weight_kg"] == 15.0

    print("Testing PATCH /api/nodes/R2 (centre to maintenance)...")
    res = client.patch("/api/nodes/R2", json={
        "name": "Mayapuri Hub Testing",
        "capacity_kg": 30.0,
        "accepted_categories": ["Batteries", "Smartphones", "Computers", "Appliances"],
        "is_active": False
    })
    assert res.status_code == 200
    r2_updated = res.json()
    assert r2_updated["name"] == "Mayapuri Hub Testing"
    assert r2_updated["max_capacity_kg"] == 30.0
    assert r2_updated["is_active"] is False

    # Check greedy evaluation skips R2 with Offline / Maintenance
    res = client.get("/api/optimize?order=default&metric=time")
    assert res.status_code == 200
    opt_data = res.json()
    for walk in opt_data["pickup_walkthroughs"]:
        eval_step = next((s for s in walk["steps"] if s["event_type"] == "greedy_eval"), None)
        if eval_step:
            r2_eval = next((c for c in eval_step["candidate_checklist"] if c["centre_id"] == "R2"), None)
            if r2_eval:
                assert r2_eval["accepted"] is False
                assert r2_eval["status_badge"] == "offline"
                assert "Offline / Maintenance" in r2_eval["reason"]

    print("Testing DELETE /api/nodes/:id (cascade edges)...")
    res = client.delete(f"/api/nodes/{created_p['id']}")
    assert res.status_code == 200
    # Verify created_e was also deleted
    graph_res = client.get("/api/graph").json()
    assert not any(n["id"] == created_p["id"] for n in graph_res["nodes"])
    assert not any(e["id"] == created_e["id"] for e in graph_res["edges"])

    print("Testing POST /api/reset restores original defaults...")
    res = client.post("/api/reset")
    assert res.status_code == 200
    reset_graph = client.get("/api/graph").json()
    assert len(reset_graph["nodes"]) == 11
    assert len(reset_graph["edges"]) == 18
    r2_node = next(n for n in reset_graph["nodes"] if n["id"] == "R2")
    assert r2_node["is_active"] is True
    assert r2_node["name"] == "Mayapuri Hub"

    # Reset demo back to 11 clean nodes
    client.post("/api/reset-demo")

    print("Testing SPA serving...")
    res = client.get("/")
    assert res.status_code == 200
    assert "<!DOCTYPE html>" in res.text or "<!doctype html>" in res.text

    print("ALL API END-TO-END TESTS PASSED!")

if __name__ == "__main__":
    test_api()
