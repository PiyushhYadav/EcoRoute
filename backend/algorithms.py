import math
import heapq
import time
from typing import Dict, List, Any, Tuple, Optional

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in kilometers."""
    R = 6371.0  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 1)

def build_adjacency_list(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    metric: str = "time"
) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """
    Builds bidirectional adjacency list.
    Effective edge cost:
      if is_blocked == 1: skip edge
      else: round((base_time_min if metric == 'time' else base_distance_km) * traffic_multiplier, 1)
    """
    nodes_dict = {n["id"]: n for n in nodes}
    edges_dict = {e["id"]: e for e in edges}
    adj: Dict[str, List[Dict[str, Any]]] = {n["id"]: [] for n in nodes}

    for edge in edges:
        if edge.get("is_blocked", 0) == 1:
            continue
        u = edge["source_id"]
        v = edge["target_id"]
        if u not in adj or v not in adj:
            continue

        mult = edge.get("traffic_multiplier", 1.0)
        base_km = edge.get("base_distance_km", 0.0)
        base_min = edge.get("base_time_min", round(base_km * 1.5, 1))

        eff_km = round(base_km * mult, 1)
        eff_min = round(base_min * mult, 1)
        eff_cost = eff_min if metric == "time" else eff_km

        eid = edge["id"]
        adj[u].append({
            "neighbor": v,
            "weight": eff_cost,
            "distance_km": eff_km,
            "time_min": eff_min,
            "edge_id": eid
        })
        adj[v].append({
            "neighbor": u,
            "weight": eff_cost,
            "distance_km": eff_km,
            "time_min": eff_min,
            "edge_id": eid
        })

    return adj, nodes_dict, edges_dict

def run_dijkstra_trace(
    start_node_id: str,
    adj: Dict[str, List[Dict[str, Any]]],
    nodes_dict: Dict[str, Dict[str, Any]],
    metric: str = "time"
) -> Tuple[
    Dict[str, float],
    Dict[str, List[str]],
    Dict[str, List[str]],
    Dict[str, float],
    Dict[str, float],
    List[Dict[str, Any]]
]:
    """
    Executes Dijkstra's algorithm with granular trace events:
    - dijkstra_init
    - dijkstra_pop
    - dijkstra_relax (only emitted when an edge is actually relaxed)
    """
    unit = "min" if metric == "time" else "km"
    start_name = nodes_dict.get(start_node_id, {}).get("name", start_node_id)

    distances: Dict[str, float] = {node_id: float("inf") for node_id in adj}
    dist_kms: Dict[str, float] = {node_id: float("inf") for node_id in adj}
    dist_mins: Dict[str, float] = {node_id: float("inf") for node_id in adj}
    predecessors: Dict[str, Optional[Tuple[str, str, float, float]]] = {node_id: None for node_id in adj}

    distances[start_node_id] = 0.0
    dist_kms[start_node_id] = 0.0
    dist_mins[start_node_id] = 0.0

    pq: List[Tuple[float, str]] = [(0.0, start_node_id)]
    visited = set()
    walkthrough_steps: List[Dict[str, Any]] = []

    def get_heap_snapshot(queue):
        return [{"node": item[1], "cost": round(item[0], 1)} for item in sorted(queue, key=lambda x: x[0])]

    # 1. dijkstra_init event
    walkthrough_steps.append({
        "event_type": "dijkstra_init",
        "pseudocode_line": 1,
        "caption": f"Initialized Dijkstra from {start_name} ({start_node_id}): dist[{start_node_id}] = 0, all other nodes = ∞. Pushed (0, {start_node_id}) to Min-Heap.",
        "current_node": start_node_id,
        "visited_nodes": [],
        "distances": {k: (9999.0 if v == float("inf") else v) for k, v in distances.items()},
        "predecessors": {},
        "heap": get_heap_snapshot(pq),
        "active_edge_id": None,
        "from_node": None,
        "to_node": None,
        "old_dist": None,
        "new_dist": None,
        "updated": False,
        "metric": metric
    })

    centres_set = {n["id"] for n in nodes_dict.values() if n.get("kind") == "centre"}

    while pq:
        curr_dist, curr_node = heapq.heappop(pq)
        if curr_node in visited:
            continue
        visited.add(curr_node)

        curr_name = nodes_dict.get(curr_node, {}).get("name", curr_node)

        # 2. dijkstra_pop event
        walkthrough_steps.append({
            "event_type": "dijkstra_pop",
            "pseudocode_line": 2,
            "caption": f"Popped {curr_name} ({curr_dist:.1f} {unit}) — smallest unvisited node in the Min-Heap.",
            "current_node": curr_node,
            "visited_nodes": list(visited),
            "distances": {k: (9999.0 if v == float("inf") else v) for k, v in distances.items()},
            "predecessors": {k: (v[0] if v else None) for k, v in predecessors.items()},
            "heap": get_heap_snapshot(pq),
            "active_edge_id": None,
            "from_node": None,
            "to_node": None,
            "old_dist": None,
            "new_dist": None,
            "updated": False,
            "metric": metric
        })

        # Stop Dijkstra exploration as soon as all reachable recycling centres are settled
        if centres_set and centres_set.issubset(visited):
            break

        # Relax incident edges
        for edge_info in adj.get(curr_node, []):
            neighbor = edge_info["neighbor"]
            if neighbor in visited:
                continue

            weight = edge_info["weight"]
            eid = edge_info["edge_id"]
            d_km = edge_info["distance_km"]
            d_min = edge_info["time_min"]

            new_dist = round(curr_dist + weight, 1)
            old_dist = distances[neighbor]

            if new_dist < old_dist:
                distances[neighbor] = new_dist
                dist_kms[neighbor] = round(dist_kms[curr_node] + d_km, 1)
                dist_mins[neighbor] = round(dist_mins[curr_node] + d_min, 1)
                predecessors[neighbor] = (curr_node, eid, d_km, d_min)
                heapq.heappush(pq, (new_dist, neighbor))

                neigh_name = nodes_dict.get(neighbor, {}).get("name", neighbor)

                # Emit relaxation event when edge beats an existing estimate or discovers a centre
                is_improvement = (old_dist < float("inf"))
                is_centre = (neighbor in centres_set)

                if is_improvement:
                    relax_caption = f"Shorter path found! {neigh_name} drops from {old_dist:.1f} → {new_dist:.1f} {unit} via {curr_name}."
                else:
                    relax_caption = f"Discovered path to {neigh_name} ({new_dist:.1f} {unit}) via {curr_name}."

                if is_improvement or is_centre:
                    walkthrough_steps.append({
                        "event_type": "dijkstra_relax",
                        "pseudocode_line": 3,
                        "caption": relax_caption,
                        "current_node": curr_node,
                        "visited_nodes": list(visited),
                        "distances": {k: (9999.0 if v == float("inf") else v) for k, v in distances.items()},
                        "predecessors": {k: (v[0] if v else None) for k, v in predecessors.items()},
                        "heap": get_heap_snapshot(pq),
                        "active_edge_id": eid,
                        "from_node": curr_node,
                        "to_node": neighbor,
                        "old_dist": None if old_dist == float("inf") else old_dist,
                        "new_dist": new_dist,
                        "updated": True,
                        "metric": metric
                    })

    # Reconstruct shortest paths strictly directed from start_node -> target
    paths: Dict[str, List[str]] = {}
    path_edges: Dict[str, List[str]] = {}

    for node_id in adj:
        if distances[node_id] == float("inf"):
            paths[node_id] = []
            path_edges[node_id] = []
            continue

        curr = node_id
        rev_path = [curr]
        rev_edges = []
        while curr != start_node_id:
            pred = predecessors[curr]
            if not pred:
                break
            prev_node, eid, _, _ = pred
            rev_edges.append(eid)
            rev_path.append(prev_node)
            curr = prev_node

        paths[node_id] = list(reversed(rev_path))
        path_edges[node_id] = list(reversed(rev_edges))

    return distances, paths, path_edges, dist_kms, dist_mins, walkthrough_steps

def run_optimization(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    order: str = "default",
    metric: str = "time"
) -> Dict[str, Any]:
    """
    Greedy Capacity-Constrained Allocation based on Metric-Aware Dijkstra Shortest Paths.
    metric: 'time' (default) or 'distance'.
    Generates structured per-pickup walkthroughs with ~6-10 crisp steps per pickup.
    """
    start_time = time.perf_counter()
    unit = "min" if metric == "time" else "km"
    adj, nodes_dict, edges_dict = build_adjacency_list(nodes, edges, metric=metric)

    pickups = [n for n in nodes if n["kind"] == "pickup"]
    centres = [n for n in nodes if n["kind"] == "centre"]

    # Sort pickups
    if order == "heaviest_first":
        sorted_pickups = sorted(pickups, key=lambda p: p.get("weight_kg", 0.0), reverse=True)
    else:
        # Natural ID order (P1, P2, P3, P4...)
        sorted_pickups = sorted(pickups, key=lambda p: p["id"])

    # Track facility capacity
    centre_capacities: Dict[str, Dict[str, float]] = {
        c["id"]: {
            "max": float(c.get("max_capacity_kg", 0.0)),
            "remaining": float(c.get("max_capacity_kg", 0.0)),
            "used": 0.0
        }
        for c in centres
    }

    pickup_walkthroughs: List[Dict[str, Any]] = []
    timeline_steps: List[Dict[str, Any]] = []
    allocations: List[Dict[str, Any]] = []
    distance_matrix: Dict[str, Dict[str, float]] = {}

    total_routed_kg = 0.0
    total_unrouted_kg = 0.0
    total_distance_km = 0.0
    total_time_min = 0.0
    assigned_count = 0
    unassigned_count = 0

    global_step_idx = 0

    for p in sorted_pickups:
        pid = p["id"]
        pname = p["name"]
        pweight = float(p.get("weight_kg", 0.0))
        ptype = p.get("waste_type", "")

        # 1. Run Dijkstra from this pickup
        dists, paths, pedges, dist_kms, dist_mins, d_steps = run_dijkstra_trace(
            pid, adj, nodes_dict, metric=metric
        )
        distance_matrix[pid] = {cid: dists.get(cid, 9999.0) for cid in centre_capacities}

        p_steps: List[Dict[str, Any]] = []

        # Center capacities snapshot before allocation of this pickup
        caps_snapshot = {cid: dict(cinfo) for cid, cinfo in centre_capacities.items()}

        for step in d_steps:
            step_record = dict(step)
            step_record["step_index"] = len(p_steps) + 1
            step_record["centre_capacities"] = {cid: dict(cinfo) for cid, cinfo in caps_snapshot.items()}
            step_record["candidate_checklist"] = []
            step_record["path_nodes"] = []
            step_record["path_edges"] = []
            step_record["total_cost"] = 0.0
            p_steps.append(step_record)

        # 2. Sort candidate centres by Dijkstra cost
        candidate_centres = sorted(centres, key=lambda c: dists.get(c["id"], float("inf")))

        checklist: List[Dict[str, Any]] = []
        chosen_centre: Optional[Dict[str, Any]] = None
        chosen_path_nodes: List[str] = []
        chosen_path_edges: List[str] = []
        chosen_cost = 0.0
        chosen_km = 0.0
        chosen_min = 0.0

        for c in candidate_centres:
            cid = c["id"]
            cname = c["name"]
            ccost = dists.get(cid, float("inf"))
            is_reachable = (ccost < float("inf"))
            accepted_list = c.get("accepted_types", [])
            is_category_match = (ptype in accepted_list)
            rem_cap = centre_capacities[cid]["remaining"]
            has_capacity = (rem_cap >= pweight)

            if not is_reachable:
                status_badge = "blocked"
                reason = "Route Blocked or Unreachable"
                accepted = False
            elif not is_category_match:
                status_badge = "wrong_category"
                reason = f"Doesn't accept {ptype}"
                accepted = False
            elif not has_capacity:
                status_badge = "capacity_full"
                reason = f"Capacity Full ({rem_cap:.1f} kg left < {pweight:.1f} kg)"
                accepted = False
            else:
                status_badge = "assigned"
                reason = "Closest eligible centre — Assigned!"
                accepted = True

            checklist_item = {
                "centre_id": cid,
                "centre_name": cname,
                "cost": ccost if is_reachable else 9999.0,
                "distance_km": dist_kms.get(cid, 9999.0) if is_reachable else 9999.0,
                "time_min": dist_mins.get(cid, 9999.0) if is_reachable else 9999.0,
                "is_reachable": is_reachable,
                "is_category_match": is_category_match,
                "has_capacity": has_capacity,
                "status_badge": status_badge,
                "accepted": accepted,
                "reason": reason
            }
            checklist.append(checklist_item)

            if accepted and chosen_centre is None:
                chosen_centre = c
                chosen_path_nodes = paths.get(cid, [])
                chosen_path_edges = pedges.get(cid, [])
                chosen_cost = ccost
                chosen_km = dist_kms.get(cid, 0.0)
                chosen_min = dist_mins.get(cid, 0.0)

        # 4. greedy_eval event
        greedy_caption = f"Greedy evaluation for {pname} ({pweight:.1f} kg {ptype}): examined {len(candidate_centres)} recycling centres ordered by {metric}."
        p_steps.append({
            "step_index": len(p_steps) + 1,
            "event_type": "greedy_eval",
            "pseudocode_line": 5,
            "caption": greedy_caption,
            "current_node": pid,
            "visited_nodes": list(dists.keys()),
            "distances": {k: (9999.0 if v == float("inf") else v) for k, v in dists.items()},
            "predecessors": {},
            "heap": [],
            "active_edge_id": None,
            "from_node": None,
            "to_node": None,
            "old_dist": None,
            "new_dist": None,
            "updated": False,
            "candidate_checklist": checklist,
            "path_nodes": [],
            "path_edges": [],
            "total_cost": 0.0,
            "metric": metric,
            "centre_capacities": {cid: dict(cinfo) for cid, cinfo in caps_snapshot.items()}
        })

        # 5. route_confirm event
        if chosen_centre:
            cid = chosen_centre["id"]
            cname = chosen_centre["name"]

            # Update capacity
            centre_capacities[cid]["remaining"] = round(centre_capacities[cid]["remaining"] - pweight, 1)
            centre_capacities[cid]["used"] = round(centre_capacities[cid]["used"] + pweight, 1)

            total_routed_kg += pweight
            total_distance_km += chosen_km
            total_time_min += chosen_min
            assigned_count += 1

            confirm_caption = f"Route Confirmed: {pname} → {cname} via {' → '.join(chosen_path_nodes)} ({chosen_cost:.1f} {unit}). Remaining capacity at {cname}: {centre_capacities[cid]['remaining']:.1f} kg."

            p_steps.append({
                "step_index": len(p_steps) + 1,
                "event_type": "route_confirm",
                "pseudocode_line": 5,
                "caption": confirm_caption,
                "current_node": cid,
                "visited_nodes": chosen_path_nodes,
                "distances": {k: (9999.0 if v == float("inf") else v) for k, v in dists.items()},
                "predecessors": {},
                "heap": [],
                "active_edge_id": None,
                "from_node": pid,
                "to_node": cid,
                "old_dist": None,
                "new_dist": None,
                "updated": False,
                "candidate_checklist": checklist,
                "path_nodes": chosen_path_nodes,
                "path_edges": chosen_path_edges,
                "total_cost": round(chosen_cost, 1),
                "metric": metric,
                "centre_capacities": {cid_k: dict(cinfo) for cid_k, cinfo in centre_capacities.items()}
            })

            allocations.append({
                "pickup_id": pid,
                "pickup_name": pname,
                "waste_type": ptype,
                "weight_kg": pweight,
                "assigned_centre_id": cid,
                "assigned_centre_name": cname,
                "path_nodes": chosen_path_nodes,
                "path_edges": chosen_path_edges,
                "total_distance_km": round(chosen_km, 1),
                "total_time_min": round(chosen_min, 1),
                "total_cost": round(chosen_cost, 1),
                "status": "assigned",
                "rejection_reason": None,
                "candidate_checklist": checklist
            })

            pickup_walkthroughs.append({
                "pickup_id": pid,
                "pickup_name": pname,
                "waste_type": ptype,
                "weight_kg": pweight,
                "assigned_centre_id": cid,
                "assigned_centre_name": cname,
                "path_nodes": chosen_path_nodes,
                "path_edges": chosen_path_edges,
                "total_cost": round(chosen_cost, 1),
                "status": "assigned",
                "rejection_reason": None,
                "steps": p_steps
            })

        else:
            total_unrouted_kg += pweight
            unassigned_count += 1

            reject_reason = "No eligible recycling centre available with matching category and remaining capacity"
            confirm_caption = f"Routing Failed for {pname} ({pweight:.1f} kg {ptype}): {reject_reason}."

            p_steps.append({
                "step_index": len(p_steps) + 1,
                "event_type": "route_confirm",
                "pseudocode_line": 5,
                "caption": confirm_caption,
                "current_node": pid,
                "visited_nodes": [pid],
                "distances": {k: (9999.0 if v == float("inf") else v) for k, v in dists.items()},
                "predecessors": {},
                "heap": [],
                "active_edge_id": None,
                "from_node": None,
                "to_node": None,
                "old_dist": None,
                "new_dist": None,
                "updated": False,
                "candidate_checklist": checklist,
                "path_nodes": [],
                "path_edges": [],
                "total_cost": 0.0,
                "metric": metric,
                "centre_capacities": {cid_k: dict(cinfo) for cid_k, cinfo in centre_capacities.items()}
            })

            allocations.append({
                "pickup_id": pid,
                "pickup_name": pname,
                "waste_type": ptype,
                "weight_kg": pweight,
                "assigned_centre_id": None,
                "assigned_centre_name": None,
                "path_nodes": [],
                "path_edges": [],
                "total_distance_km": 0.0,
                "total_time_min": 0.0,
                "total_cost": 0.0,
                "status": "unassigned",
                "rejection_reason": reject_reason,
                "candidate_checklist": checklist
            })

            pickup_walkthroughs.append({
                "pickup_id": pid,
                "pickup_name": pname,
                "waste_type": ptype,
                "weight_kg": pweight,
                "assigned_centre_id": None,
                "assigned_centre_name": None,
                "path_nodes": [],
                "path_edges": [],
                "total_cost": 0.0,
                "status": "unassigned",
                "rejection_reason": reject_reason,
                "steps": p_steps
            })

    # Legacy timeline steps builder for backwards compatibility
    timeline_steps = build_legacy_timeline_steps(pickup_walkthroughs, centre_capacities)

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
    co2_saved = round(total_routed_kg * 1.44, 1)

    greedy_summary = {
        "total_pickups": len(pickups),
        "assigned_pickups": assigned_count,
        "unassigned_pickups": unassigned_count,
        "total_routed_kg": round(total_routed_kg, 1),
        "unrouted_kg": round(total_unrouted_kg, 1),
        "total_distance_km": round(total_distance_km, 1),
        "total_time_min": round(total_time_min, 1),
        "co2_saved_kg": co2_saved,
        "execution_time_ms": elapsed_ms,
        "allocations": allocations
    }

    # Run Global Optimal Benchmark
    optimal_summary = run_global_optimal(nodes, edges, distance_matrix, pickups, centres, metric=metric)

    is_greedy_optimal = (
        greedy_summary["total_routed_kg"] >= optimal_summary["total_routed_kg"]
        and abs(greedy_summary["total_distance_km"] - optimal_summary["total_distance_km"]) < 0.1
    )

    cost_label = "min" if metric == "time" else "km"
    cost_val = round(total_time_min if metric == "time" else total_distance_km, 1)
    opt_cost_val = round(optimal_summary.get("total_time_min" if metric == "time" else "total_distance_km", 0.0), 1)

    if is_greedy_optimal:
        comparison_notes = f"Greedy matched the global optimum ({cost_val} {cost_label}, {round(greedy_summary['total_routed_kg'], 1)} kg) in {elapsed_ms} ms."
    else:
        diff_kg = round(optimal_summary["total_routed_kg"] - greedy_summary["total_routed_kg"], 1)
        diff_cost = round(cost_val - opt_cost_val, 1)
        if diff_kg > 0:
            comparison_notes = f"Global Optimal routed {diff_kg} kg more e-waste by considering combinatorial multi-pickup capacity trade-offs that Greedy local decisions missed."
        else:
            comparison_notes = f"Global Optimal found a route saving {diff_cost} {cost_label} ({opt_cost_val} {cost_label} vs {cost_val} {cost_label}) through global combinatorial coordination."

    return {
        "order": order,
        "metric": metric,
        "greedy_summary": greedy_summary,
        "optimal_summary": optimal_summary,
        "is_greedy_optimal": is_greedy_optimal,
        "comparison_notes": comparison_notes,
        "distance_matrix": distance_matrix,
        "timeline_steps": timeline_steps,
        "pickup_walkthroughs": pickup_walkthroughs
    }

def build_legacy_timeline_steps(
    pickup_walkthroughs: List[Dict[str, Any]],
    final_centre_capacities: Dict[str, Dict[str, float]]
) -> List[Dict[str, Any]]:
    steps: List[Dict[str, Any]] = []
    idx = 0

    steps.append({
        "step_index": idx,
        "phase": "init",
        "pickup_id": None,
        "pickup_name": None,
        "active_centre_id": None,
        "active_centre_name": None,
        "active_nodes": [pw["pickup_id"] for pw in pickup_walkthroughs],
        "active_edges": [],
        "active_path": [],
        "heap_snapshot": [],
        "checklist": None,
        "centre_capacities": final_centre_capacities,
        "description": f"Initialized optimizer with {len(pickup_walkthroughs)} pickup requests."
    })
    idx += 1

    for pw in pickup_walkthroughs:
        pid = pw["pickup_id"]
        pname = pw["pickup_name"]
        assigned_id = pw.get("assigned_centre_id")
        assigned_name = pw.get("assigned_centre_name")

        for s in pw["steps"]:
            phase = "dijkstra_scan"
            if s["event_type"] == "greedy_eval":
                phase = "candidate_eval"
            elif s["event_type"] == "route_confirm":
                phase = "allocation"

            steps.append({
                "step_index": idx,
                "phase": phase,
                "pickup_id": pid,
                "pickup_name": pname,
                "active_centre_id": assigned_id,
                "active_centre_name": assigned_name,
                "active_nodes": s.get("path_nodes") or [pid],
                "active_edges": s.get("path_edges") or [],
                "active_path": s.get("path_nodes") or [],
                "heap_snapshot": s.get("heap") or [],
                "checklist": s.get("candidate_checklist") or None,
                "centre_capacities": s.get("centre_capacities") or final_centre_capacities,
                "description": s["caption"]
            })
            idx += 1

    steps.append({
        "step_index": idx,
        "phase": "complete",
        "pickup_id": None,
        "pickup_name": None,
        "active_centre_id": None,
        "active_centre_name": None,
        "active_nodes": [],
        "active_edges": [],
        "active_path": [],
        "heap_snapshot": [],
        "checklist": None,
        "centre_capacities": final_centre_capacities,
        "description": "Optimization and dispatch simulation complete."
    })

    return steps

def run_global_optimal(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    distance_matrix: Dict[str, Dict[str, float]],
    pickups: List[Dict[str, Any]],
    centres: List[Dict[str, Any]],
    metric: str = "time"
) -> Dict[str, Any]:
    """
    Branch-and-Bound / Exhaustive solver for Global Optimum.
    Objective:
      1. Primary: Maximize total routed weight (kg)
      2. Secondary: Minimize total travel cost (time_min or distance_km)
    """
    start_time = time.perf_counter()
    adj, _, _ = build_adjacency_list(nodes, edges, metric=metric)

    # Precompute shortest paths and edges for each (pickup, centre) pair
    paths_cache: Dict[Tuple[str, str], Tuple[List[str], List[str], float, float, float]] = {}
    for p in pickups:
        pid = p["id"]
        dists, paths, pedges, dist_kms, dist_mins, _ = run_dijkstra_trace(pid, adj, {n["id"]: n for n in nodes}, metric=metric)
        for c in centres:
            cid = c["id"]
            paths_cache[(pid, cid)] = (
                paths.get(cid, []),
                pedges.get(cid, []),
                dists.get(cid, float("inf")),
                dist_kms.get(cid, float("inf")),
                dist_mins.get(cid, float("inf"))
            )

    p_list = list(pickups)[:10]
    c_list = list(centres)
    num_p = len(p_list)

    initial_caps = {c["id"]: float(c.get("max_capacity_kg", 0.0)) for c in c_list}

    best_result = {
        "routed_kg": -1.0,
        "cost": float("inf"),
        "dist_km": 0.0,
        "time_min": 0.0,
        "assignment": []
    }

    current_assignment: List[Tuple[Dict[str, Any], Optional[Dict[str, Any]]]] = []

    def dfs(idx: int, current_caps: Dict[str, float], current_kg: float, current_cost: float, current_km: float, current_min: float):
        nonlocal best_result
        if idx == num_p:
            if current_kg > best_result["routed_kg"]:
                best_result["routed_kg"] = current_kg
                best_result["cost"] = current_cost
                best_result["dist_km"] = current_km
                best_result["time_min"] = current_min
                best_result["assignment"] = list(current_assignment)
            elif abs(current_kg - best_result["routed_kg"]) < 1e-4 and current_cost < best_result["cost"]:
                best_result["cost"] = current_cost
                best_result["dist_km"] = current_km
                best_result["time_min"] = current_min
                best_result["assignment"] = list(current_assignment)
            return

        p = p_list[idx]
        pid = p["id"]
        pweight = float(p.get("weight_kg", 0.0))
        ptype = p.get("waste_type", "")

        for c in c_list:
            cid = c["id"]
            accepted_types = c.get("accepted_types", [])
            _, _, cost, d_km, d_min = paths_cache.get((pid, cid), ([], [], float("inf"), float("inf"), float("inf")))

            if cost < float("inf") and ptype in accepted_types and current_caps[cid] >= pweight:
                current_caps[cid] -= pweight
                current_assignment.append((p, c))

                dfs(
                    idx + 1,
                    current_caps,
                    current_kg + pweight,
                    current_cost + cost,
                    current_km + d_km,
                    current_min + d_min
                )

                current_assignment.pop()
                current_caps[cid] += pweight

        current_assignment.append((p, None))
        dfs(idx + 1, current_caps, current_kg, current_cost, current_km, current_min)
        current_assignment.pop()

    dfs(0, initial_caps, 0.0, 0.0, 0.0, 0.0)

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

    optimal_allocations: List[Dict[str, Any]] = []
    assigned_count = 0
    unassigned_count = 0

    for p, c in best_result["assignment"]:
        pid = p["id"]
        pname = p["name"]
        pweight = float(p.get("weight_kg", 0.0))
        ptype = p.get("waste_type", "")

        if c:
            cid = c["id"]
            cname = c["name"]
            path_nodes, path_edges, cost, d_km, d_min = paths_cache.get((pid, cid), ([], [], 0.0, 0.0, 0.0))
            assigned_count += 1
            optimal_allocations.append({
                "pickup_id": pid,
                "pickup_name": pname,
                "waste_type": ptype,
                "weight_kg": pweight,
                "assigned_centre_id": cid,
                "assigned_centre_name": cname,
                "path_nodes": path_nodes,
                "path_edges": path_edges,
                "total_distance_km": round(d_km, 1),
                "total_time_min": round(d_min, 1),
                "total_cost": round(cost, 1),
                "status": "assigned",
                "rejection_reason": None,
                "candidate_checklist": []
            })
        else:
            unassigned_count += 1
            optimal_allocations.append({
                "pickup_id": pid,
                "pickup_name": pname,
                "waste_type": ptype,
                "weight_kg": pweight,
                "assigned_centre_id": None,
                "assigned_centre_name": None,
                "path_nodes": [],
                "path_edges": [],
                "total_distance_km": 0.0,
                "total_time_min": 0.0,
                "total_cost": 0.0,
                "status": "unassigned",
                "rejection_reason": "Skipped in global optimal search to maximize total network throughput",
                "candidate_checklist": []
            })

    total_routed = max(0.0, best_result["routed_kg"])
    total_dist = 0.0 if best_result["dist_km"] == float("inf") else best_result["dist_km"]
    total_time = 0.0 if best_result["time_min"] == float("inf") else best_result["time_min"]
    total_unrouted = sum(float(p.get("weight_kg", 0.0)) for p, c in best_result["assignment"] if c is None)

    return {
        "total_pickups": num_p,
        "assigned_pickups": assigned_count,
        "unassigned_pickups": unassigned_count,
        "total_routed_kg": round(total_routed, 1),
        "unrouted_kg": round(total_unrouted, 1),
        "total_distance_km": round(total_dist, 1),
        "total_time_min": round(total_time, 1),
        "co2_saved_kg": round(total_routed * 1.44, 1),
        "execution_time_ms": elapsed_ms,
        "allocations": optimal_allocations
    }
