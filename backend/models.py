from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, model_validator

# 4 Real-World E-Waste Categories
WasteTypeLiteral = Literal["Batteries", "Computers", "Smartphones", "Appliances"]
WASTE_CATEGORIES = ["Batteries", "Computers", "Smartphones", "Appliances"]

class NodeModel(BaseModel):
    id: str
    name: str
    kind: Literal["pickup", "junction", "centre"]
    x: float
    y: float
    lat: Optional[float] = 28.6
    lng: Optional[float] = 77.2
    waste_type: Optional[WasteTypeLiteral] = None
    weight_kg: float = 0.0
    max_capacity_kg: float = 0.0
    accepted_types: List[WasteTypeLiteral] = Field(default_factory=list)
    donor_name: Optional[str] = None
    status: str = "pending"

class PickupCreate(BaseModel):
    name: str
    x: Optional[float] = None
    y: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    waste_type: WasteTypeLiteral
    weight_kg: float = Field(gt=0, le=500)
    donor_name: Optional[str] = None

class PickupUpdate(BaseModel):
    name: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    waste_type: Optional[WasteTypeLiteral] = None
    weight_kg: Optional[float] = Field(default=None, gt=0, le=500)
    donor_name: Optional[str] = None
    status: Optional[str] = None

class CentreCreate(BaseModel):
    name: str
    x: Optional[float] = None
    y: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    max_capacity_kg: float = Field(gt=0)
    accepted_types: List[WasteTypeLiteral] = Field(min_length=1)

class CentreUpdate(BaseModel):
    name: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    max_capacity_kg: Optional[float] = Field(default=None, gt=0)
    accepted_types: Optional[List[WasteTypeLiteral]] = None

class EdgeModel(BaseModel):
    id: str
    source_id: str
    target_id: str
    base_distance_km: float
    base_time_min: float
    traffic_multiplier: float = 1.0
    is_blocked: int = 0
    effective_distance_km: Optional[float] = None
    effective_time_min: Optional[float] = None

class EdgeCreate(BaseModel):
    id: Optional[str] = None
    source_id: str
    target_id: str
    base_distance_km: Optional[float] = None
    base_time_min: Optional[float] = None
    traffic_multiplier: float = 1.0
    is_blocked: int = 0

class EdgeUpdate(BaseModel):
    base_distance_km: Optional[float] = None
    base_time_min: Optional[float] = None
    traffic_multiplier: Optional[float] = None
    is_blocked: Optional[int] = None

class GraphResponse(BaseModel):
    nodes: List[NodeModel]
    edges: List[EdgeModel]

class CandidateEvaluation(BaseModel):
    centre_id: str
    centre_name: str
    cost: float
    distance_km: float
    time_min: float
    is_reachable: bool
    is_category_match: bool
    has_capacity: bool
    status_badge: Literal["assigned", "wrong_category", "capacity_full", "blocked"]
    accepted: bool
    reason: str

class RouteAssignment(BaseModel):
    pickup_id: str
    pickup_name: str
    waste_type: str
    weight_kg: float
    assigned_centre_id: Optional[str] = None
    assigned_centre_name: Optional[str] = None
    path_nodes: List[str] = Field(default_factory=list)
    path_edges: List[str] = Field(default_factory=list)
    total_distance_km: float = 0.0
    total_time_min: float = 0.0
    total_cost: float = 0.0
    status: Literal["assigned", "unassigned"]
    rejection_reason: Optional[str] = None
    candidate_checklist: List[CandidateEvaluation] = Field(default_factory=list)

class WalkthroughStep(BaseModel):
    step_index: int
    event_type: Literal["dijkstra_init", "dijkstra_pop", "dijkstra_relax", "greedy_eval", "route_confirm"]
    pseudocode_line: int # 1..5
    caption: str
    current_node: Optional[str] = None
    visited_nodes: List[str] = Field(default_factory=list)
    distances: Dict[str, float] = Field(default_factory=dict)
    predecessors: Dict[str, Optional[str]] = Field(default_factory=dict)
    heap: List[Dict[str, Any]] = Field(default_factory=list)
    active_edge_id: Optional[str] = None
    from_node: Optional[str] = None
    to_node: Optional[str] = None
    old_dist: Optional[float] = None
    new_dist: Optional[float] = None
    updated: bool = False
    candidate_checklist: List[CandidateEvaluation] = Field(default_factory=list)
    path_nodes: List[str] = Field(default_factory=list)
    path_edges: List[str] = Field(default_factory=list)
    total_cost: float = 0.0
    metric: str = "time"
    centre_capacities: Dict[str, Dict[str, float]] = Field(default_factory=dict)

class PickupWalkthrough(BaseModel):
    pickup_id: str
    pickup_name: str
    waste_type: str
    weight_kg: float
    assigned_centre_id: Optional[str] = None
    assigned_centre_name: Optional[str] = None
    path_nodes: List[str] = Field(default_factory=list)
    path_edges: List[str] = Field(default_factory=list)
    total_cost: float = 0.0
    status: Literal["assigned", "unassigned"]
    rejection_reason: Optional[str] = None
    steps: List[WalkthroughStep] = Field(default_factory=list)

class TimelineStep(BaseModel):
    step_index: int
    phase: Literal["init", "dijkstra_scan", "candidate_eval", "allocation", "transit", "capacity_update", "complete"]
    pickup_id: Optional[str] = None
    pickup_name: Optional[str] = None
    active_centre_id: Optional[str] = None
    active_centre_name: Optional[str] = None
    active_nodes: List[str] = Field(default_factory=list)
    active_edges: List[str] = Field(default_factory=list)
    active_path: List[str] = Field(default_factory=list)
    heap_snapshot: Optional[List[Dict[str, Any]]] = None
    checklist: Optional[List[CandidateEvaluation]] = None
    centre_capacities: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    description: str

class OptimizerSummary(BaseModel):
    total_pickups: int
    assigned_pickups: int
    unassigned_pickups: int
    total_routed_kg: float
    unrouted_kg: float
    total_distance_km: float
    total_time_min: float = 0.0
    co2_saved_kg: float
    execution_time_ms: float
    allocations: List[RouteAssignment]

class OptimizationResponse(BaseModel):
    order: str
    metric: str = "time"
    greedy_summary: OptimizerSummary
    optimal_summary: OptimizerSummary
    is_greedy_optimal: bool
    comparison_notes: str
    distance_matrix: Dict[str, Dict[str, float]]
    timeline_steps: List[TimelineStep] = Field(default_factory=list)
    pickup_walkthroughs: List[PickupWalkthrough] = Field(default_factory=list)
    graph: GraphResponse
