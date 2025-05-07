from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# --- Input Models ---
class Node(BaseModel):
    id: str
    name: str
    # Optional: For visualization or more complex light logic
    x: Optional[float] = None
    y: Optional[float] = None

class Edge(BaseModel):
    source: str
    target: str
    base_travel_time: float # in seconds, or abstract units
    capacity: Optional[int] = 100 # Max vehicles road can handle comfortably

class CityMap(BaseModel):
    nodes: List[Node]
    edges: List[Edge]

class TrafficUpdate(BaseModel):
    road_id: str # e.g., "A-B"
    congestion_level: float # 0.0 (clear) to 1.0 (jammed), or vehicle count
    # Alternatively, directly pass vehicle_count if preferred
    # vehicle_count: int

class RouteRequest(BaseModel):
    start_node_id: str
    end_node_id: str
    vehicle_id: Optional[str] = None # For tracking specific vehicles

class Vehicle(BaseModel):
    id: str
    current_node_id: str
    destination_node_id: str
    current_path: Optional[List[str]] = None
    path_cost: Optional[float] = None

# --- Output Models ---
class TrafficLightTiming(BaseModel):
    intersection_id: str
    # Phases: e.g., "NS_green_EW_red", "NS_red_EW_green"
    # Or simpler: timings for each road entering the intersection
    # For simplicity, let's assume phases and their green duration
    # Example: {"road_A_to_X": 30, "road_B_to_X": 20}
    # This needs careful design based on how intersections are modeled
    green_times: Dict[str, int] # road_id entering intersection -> green_seconds

class SuggestedRoute(BaseModel):
    vehicle_id: Optional[str] = None
    path: List[str] # List of node IDs
    estimated_travel_time: float

class SystemState(BaseModel):
    routes: List[SuggestedRoute]
    traffic_lights: List[TrafficLightTiming]