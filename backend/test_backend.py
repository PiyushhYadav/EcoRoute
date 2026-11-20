import sys
import os
from pathlib import Path

# Add backend to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

import database as db
import algorithms as algo
from models import OptimizationResponse

def test():
    print("Initializing DB...")
    db.init_db()
    db.seed_default_delhi_data(force=True)

    nodes = db.get_all_nodes()
    edges = db.get_all_edges()
    print(f"Loaded {len(nodes)} nodes and {len(edges)} edges.")
    assert len(nodes) == 11, f"Expected 11 nodes, got {len(nodes)}"
    assert len(edges) == 18, f"Expected 18 edges, got {len(edges)}"

    # Check canvas coordinates are present
    for n in nodes:
        assert "x" in n and "y" in n, f"Node {n['id']} missing x or y coordinates"
        assert 0 <= n["x"] <= 1000, f"Node {n['id']} x out of bounds: {n['x']}"
        assert 0 <= n["y"] <= 660, f"Node {n['id']} y out of bounds: {n['y']}"

    # Check dual weights on edges
    for e in edges:
        assert "base_distance_km" in e and "base_time_min" in e, f"Edge {e['id']} missing dual weights"
        assert e["base_distance_km"] > 0, f"Edge {e['id']} distance invalid"
        assert e["base_time_min"] > 0, f"Edge {e['id']} time invalid"

    # 1. Test Dijkstra Trap for P1:
    # In time mode: P1 -> J3 -> R2 = 8 + 9 = 17 min < direct P1 -> R2 = 26 min!
    adj_time, nodes_dict, _ = algo.build_adjacency_list(nodes, edges, metric="time")
    dists_time, paths_time, pedges_time, _, _, _ = algo.run_dijkstra_trace("P1", adj_time, nodes_dict, metric="time")
    print(f"[TIME MODE] P1 to R2: cost = {dists_time['R2']} min, path = {paths_time['R2']}")
    assert dists_time["R2"] == 17.0, f"Expected 17.0 min to R2, got {dists_time['R2']}"
    assert paths_time["R2"] == ["P1", "J3", "R2"], f"Expected path ['P1', 'J3', 'R2'], got {paths_time['R2']}"

    # In distance mode: direct P1 -> R2 = 8.0 km < P1 -> J3 -> R2 = 10.0 km!
    adj_dist, _, _ = algo.build_adjacency_list(nodes, edges, metric="distance")
    dists_dist, paths_dist, pedges_dist, _, _, _ = algo.run_dijkstra_trace("P1", adj_dist, nodes_dict, metric="distance")
    print(f"[DISTANCE MODE] P1 to R2: cost = {dists_dist['R2']} km, path = {paths_dist['R2']}")
    assert dists_dist["R2"] == 8.0, f"Expected 8.0 km to R2, got {dists_dist['R2']}"
    assert paths_dist["R2"] == ["P1", "R2"], f"Expected path ['P1', 'R2'], got {paths_dist['R2']}"

    # 2. Test P2 bypass to J2:
    # P2 -> J4 -> J2 = 5+5 = 10 km (vs direct E6 11 km) and 7+8 = 15 min (vs direct E6 24 min)
    dists_p2_time, paths_p2_time, _, _, _, _ = algo.run_dijkstra_trace("P2", adj_time, nodes_dict, metric="time")
    print(f"[TIME MODE] P2 to J2: cost = {dists_p2_time['J2']} min, path = {paths_p2_time['J2']}")
    assert dists_p2_time["J2"] == 15.0, f"Expected 15.0 min to J2, got {dists_p2_time['J2']}"
    assert paths_p2_time["J2"] == ["P2", "J4", "J2"], f"Expected ['P2', 'J4', 'J2'], got {paths_p2_time['J2']}"

    # 3. Test Full Optimization with Greedy Capacity Fallback:
    res_time = algo.run_optimization(nodes, edges, order="default", metric="time")
    print("\n--- OPTIMIZATION RESULT (TIME MODE) ---")
    allocs = res_time["greedy_summary"]["allocations"]
    for a in allocs:
        print(f"  {a['pickup_id']} ({a['pickup_name']}, {a['weight_kg']} kg {a['waste_type']}) -> {a['assigned_centre_name']} ({a['assigned_centre_id']}) via {' -> '.join(a['path_nodes'])} | {a['total_time_min']} min, {a['total_distance_km']} km")

    # Check that P1 went to R2
    p1_alloc = next(a for a in allocs if a["pickup_id"] == "P1")
    assert p1_alloc["assigned_centre_id"] == "R2", f"P1 should be assigned to R2, got {p1_alloc['assigned_centre_id']}"

    # Check that P2 went to R3 because R2 ran out of capacity! (R2 has 22 cap, P1 used 12 -> 10 left < 16 kg)
    p2_alloc = next(a for a in allocs if a["pickup_id"] == "P2")
    assert p2_alloc["assigned_centre_id"] == "R3", f"P2 should be assigned to R3, got {p2_alloc['assigned_centre_id']}"

    # Check that all 3 centres (R1, R2, R3) are utilized across all pickups
    assigned_centres = {a["assigned_centre_id"] for a in allocs if a["status"] == "assigned"}
    print(f"Assigned centres: {assigned_centres}")
    assert "R1" in assigned_centres, "R1 should be utilized"
    assert "R2" in assigned_centres, "R2 should be utilized"
    assert "R3" in assigned_centres, "R3 should be utilized"

    # Check walkthroughs structure
    walkthroughs = res_time["pickup_walkthroughs"]
    assert len(walkthroughs) == 4, f"Expected 4 pickup walkthroughs, got {len(walkthroughs)}"
    for w in walkthroughs:
        print(f"Pickup {w['pickup_id']} has {len(w['steps'])} walkthrough steps.")
        assert 5 <= len(w['steps']) <= 30, f"Walkthrough for {w['pickup_id']} should have crisp steps, got {len(w['steps'])}"
        event_types = [s["event_type"] for s in w["steps"]]
        assert "dijkstra_init" in event_types
        assert "dijkstra_pop" in event_types
        assert "greedy_eval" in event_types
        assert "route_confirm" in event_types

    # Validate against Pydantic schema
    res_time["graph"] = {"nodes": nodes, "edges": edges}
    validated = OptimizationResponse.model_validate(res_time)
    print("OptimizationResponse successfully validated against Pydantic schema!")
    print("\nALL BACKEND & ALGORITHM TESTS PASSED!")

if __name__ == "__main__":
    test()
