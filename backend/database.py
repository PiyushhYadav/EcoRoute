import sqlite3
import json
import os
import sys
import math
import threading
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

DB_PATH = Path(__file__).resolve().parent / "ecoroute.db"

# Thread-safe re-entrant lock to prevent concurrent thread collisions on SQLite
_db_lock = threading.RLock()

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=60.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn

def with_retry(max_attempts: int = 5, delay: float = 0.1):
    def decorator(func):
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except sqlite3.OperationalError as e:
                    if "database is locked" in str(e).lower() and attempt < max_attempts - 1:
                        time.sleep(delay * (attempt + 1))
                        continue
                    raise
        return wrapper
    return decorator

def xy_from_latlng(lat: float, lng: float) -> tuple[float, float]:
    x = max(0.0, min(1000.0, ((lng - 77.0) / 0.3) * 1000.0))
    y = max(0.0, min(660.0, ((28.85 - lat) / 0.4) * 660.0))
    return round(x, 1), round(y, 1)

def latlng_from_xy(x: float, y: float) -> tuple[float, float]:
    lng = 77.0 + (x / 1000.0) * 0.3
    lat = 28.85 - (y / 660.0) * 0.4
    return round(lat, 4), round(lng, 4)

def haversine_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * (math.sin(dlam / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return round(R * c, 2)

@with_retry()
def init_db():
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Check if existing schema has 'x' and 'base_time_min'
        needs_recreate = False
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(nodes)")
            cols = [r["name"] for r in cursor.fetchall()]
            if "x" not in cols or "y" not in cols:
                needs_recreate = True

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='edges'")
        if cursor.fetchone():
            cursor.execute("PRAGMA table_info(edges)")
            cols = [r["name"] for r in cursor.fetchall()]
            if "base_time_min" not in cols:
                needs_recreate = True

        if needs_recreate:
            cursor.execute("DROP TABLE IF EXISTS edges")
            cursor.execute("DROP TABLE IF EXISTS nodes")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('pickup', 'junction', 'centre')),
            x REAL NOT NULL,
            y REAL NOT NULL,
            lat REAL,
            lng REAL,
            waste_type TEXT,
            weight_kg REAL DEFAULT 0,
            max_capacity_kg REAL DEFAULT 0,
            accepted_types TEXT DEFAULT '[]',
            donor_name TEXT,
            status TEXT DEFAULT 'pending'
        );
        """)

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS edges (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            base_distance_km REAL NOT NULL,
            base_time_min REAL NOT NULL,
            traffic_multiplier REAL DEFAULT 1.0,
            is_blocked INTEGER DEFAULT 0,
            FOREIGN KEY (source_id) REFERENCES nodes (id) ON DELETE CASCADE,
            FOREIGN KEY (target_id) REFERENCES nodes (id) ON DELETE CASCADE
        );
        """)

        conn.commit()
        conn.close()

@with_retry()
def seed_default_delhi_data(force: bool = False):
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()

        if not force:
            cursor.execute("SELECT id, lat, lng FROM nodes")
            rows = cursor.fetchall()
            needs_reseed = len(rows) < 11
            for r in rows:
                if not r["lat"] or not r["lng"] or (r["lat"] == 0 and r["lng"] == 0):
                    needs_reseed = True
                if r["id"] == "R3" and abs(r["lat"] - 28.7580) > 0.01:
                    needs_reseed = True
                if r["id"] == "P1" and abs(r["lat"] - 28.6219) > 0.01:
                    needs_reseed = True
            if not needs_reseed:
                conn.close()
                return

        cursor.execute("DELETE FROM edges")
        cursor.execute("DELETE FROM nodes")

        # 1. Seed 11 well-spaced Nodes (4 Pickups, 4 Junctions, 3 Centres) with real Delhi NCR coordinates
        nodes_data = [
            # 4 Pickups
            {
                "id": "P1",
                "name": "Janakpuri",
                "kind": "pickup",
                "x": 246.7,
                "y": 376.4,
                "lat": 28.6219,
                "lng": 77.0740,
                "waste_type": "Batteries",
                "weight_kg": 12.0,
                "max_capacity_kg": 0.0,
                "accepted_types": "[]",
                "donor_name": "Apex Electronics",
                "status": "pending"
            },
            {
                "id": "P2",
                "name": "CyberHub",
                "kind": "pickup",
                "x": 286.7,
                "y": 585.8,
                "lat": 28.4950,
                "lng": 77.0860,
                "waste_type": "Computers",
                "weight_kg": 16.0,
                "max_capacity_kg": 0.0,
                "accepted_types": "[]",
                "donor_name": "DLF Tech Park",
                "status": "pending"
            },
            {
                "id": "P3",
                "name": "Dwarka Sec 21",
                "kind": "pickup",
                "x": 194.0,
                "y": 491.4,
                "lat": 28.5522,
                "lng": 77.0582,
                "waste_type": "Smartphones",
                "weight_kg": 12.0,
                "max_capacity_kg": 0.0,
                "accepted_types": "[]",
                "donor_name": "Metro Tech Hub",
                "status": "pending"
            },
            {
                "id": "P4",
                "name": "Connaught Place",
                "kind": "pickup",
                "x": 738.3,
                "y": 360.5,
                "lat": 28.6315,
                "lng": 77.2215,
                "waste_type": "Appliances",
                "weight_kg": 15.0,
                "max_capacity_kg": 0.0,
                "accepted_types": "[]",
                "donor_name": "Regal Plaza",
                "status": "pending"
            },

            # 4 Transit Junctions
            {
                "id": "J1",
                "name": "Dhaula Kuan",
                "kind": "junction",
                "x": 560.0,
                "y": 430.6,
                "lat": 28.5890,
                "lng": 77.1680,
                "waste_type": None,
                "weight_kg": 0.0,
                "max_capacity_kg": 0.0,
                "accepted_types": "[]",
                "donor_name": None,
                "status": "active"
            },
            {
                "id": "J2",
                "name": "Mahipalpur",
                "kind": "junction",
                "x": 453.3,
                "y": 502.4,
                "lat": 28.5455,
                "lng": 77.1360,
                "waste_type": None,
                "weight_kg": 0.0,
                "max_capacity_kg": 0.0,
                "accepted_types": "[]",
                "donor_name": None,
                "status": "active"
            },
            {
                "id": "J3",
                "name": "Punjabi Bagh",
                "kind": "junction",
                "x": 439.0,
                "y": 298.3,
                "lat": 28.6692,
                "lng": 77.1317,
                "waste_type": None,
                "weight_kg": 0.0,
                "max_capacity_kg": 0.0,
                "accepted_types": "[]",
                "donor_name": None,
                "status": "active"
            },
            {
                "id": "J4",
                "name": "IFFCO Chowk",
                "kind": "junction",
                "x": 473.3,
                "y": 617.1,
                "lat": 28.4760,
                "lng": 77.1420,
                "waste_type": None,
                "weight_kg": 0.0,
                "max_capacity_kg": 0.0,
                "accepted_types": "[]",
                "donor_name": None,
                "status": "active"
            },

            # 3 Recycling Centres
            {
                "id": "R1",
                "name": "Okhla Plant",
                "kind": "centre",
                "x": 906.7,
                "y": 509.8,
                "lat": 28.5410,
                "lng": 77.2720,
                "waste_type": None,
                "weight_kg": 0.0,
                "max_capacity_kg": 20.0,
                "accepted_types": json.dumps(["Batteries", "Smartphones"]),
                "donor_name": None,
                "status": "active"
            },
            {
                "id": "R2",
                "name": "Mayapuri Hub",
                "kind": "centre",
                "x": 460.0,
                "y": 368.8,
                "lat": 28.6265,
                "lng": 77.1380,
                "waste_type": None,
                "weight_kg": 0.0,
                "max_capacity_kg": 22.0,
                "accepted_types": json.dumps(["Batteries", "Computers", "Smartphones"]),
                "donor_name": None,
                "status": "active"
            },
            {
                "id": "R3",
                "name": "Bawana Plant",
                "kind": "centre",
                "x": 406.7,
                "y": 151.8,
                "lat": 28.7580,
                "lng": 77.1220,
                "waste_type": None,
                "weight_kg": 0.0,
                "max_capacity_kg": 40.0,
                "accepted_types": json.dumps(["Batteries", "Computers", "Smartphones", "Appliances"]),
                "donor_name": None,
                "status": "active"
            }
        ]

        for node in nodes_data:
            cursor.execute("""
                INSERT INTO nodes (id, name, kind, x, y, lat, lng, waste_type, weight_kg, max_capacity_kg, accepted_types, donor_name, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                node["id"], node["name"], node["kind"], node["x"], node["y"],
                node["lat"], node["lng"], node["waste_type"], node["weight_kg"],
                node["max_capacity_kg"], node["accepted_types"], node["donor_name"],
                node["status"]
            ))

        # 18 Straight Weighted Edges with deliberate Dijkstra traps
        raw_edges = [
            ("E1", "P1", "R2", 8.0, 26.0),
            ("E2", "P1", "J3", 5.0, 8.0),
            ("E3", "J3", "R2", 5.0, 9.0),
            ("E4", "P1", "P3", 9.0, 14.0),
            ("E5", "P3", "J2", 8.0, 12.0),
            ("E6", "P2", "J2", 11.0, 24.0),
            ("E7", "P2", "J4", 5.0, 7.0),
            ("E8", "J4", "J2", 5.0, 8.0),
            ("E9", "P2", "P3", 10.0, 15.0),
            ("E10", "J2", "J1", 7.0, 10.0),
            ("E11", "R2", "J1", 6.0, 9.0),
            ("E12", "J1", "P4", 7.0, 11.0),
            ("E13", "P4", "R1", 14.0, 32.0),
            ("E14", "J1", "R1", 9.0, 13.0),
            ("E15", "J2", "R1", 14.0, 22.0),
            ("E16", "J3", "R3", 13.0, 18.0),
            ("E17", "P4", "R3", 19.0, 28.0),
            ("E18", "J3", "P4", 11.0, 16.0),
        ]

        for eid, u, v, dist_km, time_min in raw_edges:
            cursor.execute("""
                INSERT INTO edges (id, source_id, target_id, base_distance_km, base_time_min, traffic_multiplier, is_blocked)
                VALUES (?, ?, ?, ?, ?, 1.0, 0)
            """, (eid, u, v, dist_km, time_min))

        conn.commit()
        conn.close()

@with_retry()
def get_all_nodes() -> List[Dict[str, Any]]:
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM nodes")
        rows = cursor.fetchall()
        nodes = []
        for row in rows:
            n = dict(row)
            try:
                n["accepted_types"] = json.loads(n.get("accepted_types") or "[]")
            except Exception:
                n["accepted_types"] = []
            nodes.append(n)
        conn.close()
        return nodes

@with_retry()
def get_node_by_id(node_id: str) -> Optional[Dict[str, Any]]:
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        n = dict(row)
        try:
            n["accepted_types"] = json.loads(n.get("accepted_types") or "[]")
        except Exception:
            n["accepted_types"] = []
        return n

@with_retry()
def create_node(node_data: Dict[str, Any]) -> Dict[str, Any]:
    with _db_lock:
        accepted = node_data.get("accepted_types", [])
        if isinstance(accepted, list):
            accepted_json = json.dumps(accepted)
        else:
            accepted_json = accepted or "[]"

        # Ensure x, y and lat, lng are both filled
        x = node_data.get("x")
        y = node_data.get("y")
        lat = node_data.get("lat")
        lng = node_data.get("lng")

        if x is None or y is None:
            if lat is not None and lng is not None:
                x, y = xy_from_latlng(lat, lng)
            else:
                x, y = 500.0, 330.0
        if lat is None or lng is None:
            lat, lng = latlng_from_xy(x, y)

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO nodes (id, name, kind, x, y, lat, lng, waste_type, weight_kg, max_capacity_kg, accepted_types, donor_name, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            node_data["id"],
            node_data["name"],
            node_data["kind"],
            float(x),
            float(y),
            float(lat),
            float(lng),
            node_data.get("waste_type"),
            node_data.get("weight_kg", 0.0),
            node_data.get("max_capacity_kg", 0.0),
            accepted_json,
            node_data.get("donor_name"),
            node_data.get("status", "pending")
        ))
        conn.commit()
        conn.close()

        # Auto connect to nearest 2 nodes
        auto_connect_to_nearest(node_data["id"], k=2)

        return get_node_by_id(node_data["id"])

@with_retry()
def update_node(node_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()

        fields = []
        values = []
        for k, v in updates.items():
            if v is not None:
                if k == "accepted_types" and isinstance(v, list):
                    fields.append(f"{k} = ?")
                    values.append(json.dumps(v))
                else:
                    fields.append(f"{k} = ?")
                    values.append(v)

        if not fields:
            conn.close()
            return get_node_by_id(node_id)

        values.append(node_id)
        query = f"UPDATE nodes SET {', '.join(fields)} WHERE id = ?"
        cursor.execute(query, tuple(values))
        conn.commit()
        conn.close()
        return get_node_by_id(node_id)

@with_retry()
def delete_node(node_id: str) -> bool:
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM edges WHERE source_id = ? OR target_id = ?", (node_id, node_id))
        cursor.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        return affected > 0

@with_retry()
def get_all_edges() -> List[Dict[str, Any]]:
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM edges")
        rows = cursor.fetchall()
        edges = []
        for row in rows:
            e = dict(row)
            mult = e.get("traffic_multiplier", 1.0)
            base_km = e.get("base_distance_km", 0.0)
            base_min = e.get("base_time_min", round(base_km * 1.5, 1))
            e["effective_distance_km"] = round(base_km * mult, 1)
            e["effective_time_min"] = round(base_min * mult, 1)
            edges.append(e)
        conn.close()
        return edges

@with_retry()
def get_edge_by_id(edge_id: str) -> Optional[Dict[str, Any]]:
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM edges WHERE id = ?", (edge_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        e = dict(row)
        mult = e.get("traffic_multiplier", 1.0)
        base_km = e.get("base_distance_km", 0.0)
        base_min = e.get("base_time_min", round(base_km * 1.5, 1))
        e["effective_distance_km"] = round(base_km * mult, 1)
        e["effective_time_min"] = round(base_min * mult, 1)
        return e

@with_retry()
def create_edge(edge_data: Dict[str, Any]) -> Dict[str, Any]:
    with _db_lock:
        source_id = edge_data["source_id"]
        target_id = edge_data["target_id"]
        eid = edge_data.get("id") or f"E_{source_id}_{target_id}"

        base_dist = edge_data.get("base_distance_km")
        base_time = edge_data.get("base_time_min")

        if base_dist is None or base_dist <= 0 or base_time is None or base_time <= 0:
            n1 = get_node_by_id(source_id)
            n2 = get_node_by_id(target_id)
            if n1 and n2:
                if n1.get("lat") and n1.get("lng") and n2.get("lat") and n2.get("lng"):
                    h_dist = haversine_distance_km(n1["lat"], n1["lng"], n2["lat"], n2["lng"])
                    if base_dist is None or base_dist <= 0:
                        base_dist = round(max(0.5, h_dist), 1)
                    if base_time is None or base_time <= 0:
                        base_time = round(max(2.0, base_dist * 1.8), 1)
                else:
                    pixel_dist = math.hypot(n1["x"] - n2["x"], n1["y"] - n2["y"])
                    if base_dist is None or base_dist <= 0:
                        base_dist = round(max(1.0, pixel_dist / 28.0), 1)
                    if base_time is None or base_time <= 0:
                        base_time = round(max(2.0, pixel_dist / 18.0), 1)
            else:
                base_dist = base_dist or 5.0
                base_time = base_time or 8.0

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO edges (id, source_id, target_id, base_distance_km, base_time_min, traffic_multiplier, is_blocked)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            eid,
            source_id,
            target_id,
            base_dist,
            base_time,
            edge_data.get("traffic_multiplier", 1.0),
            edge_data.get("is_blocked", 0)
        ))
        conn.commit()
        conn.close()
        return get_edge_by_id(eid)

@with_retry()
def update_edge(edge_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()

        fields = []
        values = []
        for k, v in updates.items():
            if v is not None:
                fields.append(f"{k} = ?")
                values.append(v)

        if not fields:
            conn.close()
            return get_edge_by_id(edge_id)

        values.append(edge_id)
        query = f"UPDATE edges SET {', '.join(fields)} WHERE id = ?"
        cursor.execute(query, tuple(values))
        conn.commit()
        conn.close()
        return get_edge_by_id(edge_id)

@with_retry()
def delete_edge(edge_id: str) -> bool:
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM edges WHERE id = ?", (edge_id,))
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        return affected > 0

@with_retry()
def auto_connect_to_nearest(node_id: str, k: int = 2):
    """
    Auto-Connect Rule for New Canvas / Map Pins:
    Calculates Euclidean canvas distance to all existing nodes and creates straight road edges
    connecting it to the k nearest existing nodes.
    """
    with _db_lock:
        target_node = get_node_by_id(node_id)
        if not target_node:
            return

        all_nodes = get_all_nodes()
        existing_edges = get_all_edges()

        connected_pairs = set()
        for e in existing_edges:
            connected_pairs.add((e["source_id"], e["target_id"]))
            connected_pairs.add((e["target_id"], e["source_id"]))

        other_nodes = [n for n in all_nodes if n["id"] != node_id]
        if not other_nodes:
            return

        candidates = []
        for other in other_nodes:
            if target_node.get("lat") and target_node.get("lng") and other.get("lat") and other.get("lng"):
                dist_val = haversine_distance_km(target_node["lat"], target_node["lng"], other["lat"], other["lng"])
                is_geo = True
            else:
                dist_val = math.hypot(target_node["x"] - other["x"], target_node["y"] - other["y"])
                is_geo = False
            candidates.append((dist_val, is_geo, other))

        candidates.sort(key=lambda item: item[0])

        added_count = 0
        for dist_val, is_geo, other in candidates:
            if added_count >= k:
                break
            if (node_id, other["id"]) not in connected_pairs:
                eid = f"E_{node_id}_{other['id']}"
                if is_geo:
                    road_km = round(max(0.5, dist_val), 1)
                    road_time = round(max(2.0, road_km * 1.8), 1)
                else:
                    road_km = round(max(1.0, dist_val / 28.0), 1)
                    road_time = round(max(2.0, dist_val / 18.0), 1)
                create_edge({
                    "id": eid,
                    "source_id": node_id,
                    "target_id": other["id"],
                    "base_distance_km": road_km,
                    "base_time_min": road_time,
                    "traffic_multiplier": 1.0,
                    "is_blocked": 0
                })
                connected_pairs.add((node_id, other["id"]))
                connected_pairs.add((other["id"], node_id))
                added_count += 1
