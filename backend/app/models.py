from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional,Tuple

# --- Input Models ---
class Node(BaseModel):
    id: str
    name: str
    x: Optional[float] = None
    y: Optional[float] = None

class Edge(BaseModel):
    source: str
    target: str
    base_travel_time: float # in seconds
    capacity: Optional[int] = 100

class CityMap(BaseModel):
    nodes: List[Node]
    edges: List[Edge]

class TrafficUpdate(BaseModel):
    road_id: str # "source-target"
    congestion_level: Optional[float] = None # 0.0 to 1.0
    vehicle_count: Optional[int] = None

class RouteRequest(BaseModel):
    start_node_id: str
    end_node_id: str
    vehicle_id: Optional[str] = None

class VehicleStateEnum: # Using a class for enum-like strings
    IDLE = "idle" # At an intersection, waiting for next move or new path
    ON_ROUTE = "on_route" # Actively traversing a path
    ARRIVED = "arrived" # Reached destination

class Vehicle(BaseModel):
    id: str
    start_node_id: str # Original start
    destination_node_id: str # Final destination
    
    # Dynamic state for simulation
    current_node_id: str # Current intersection if idle/arrived, or start of current_road_segment if on_route
    current_road_segment: Optional[Tuple[str, str]] = None # (source, target) of the road currently on
    time_on_current_segment: float = 0.0 # Simulated seconds spent on current_road_segment
    current_path_index: int = 0 # Index of the next node in current_path to reach
    state: str = Field(default=VehicleStateEnum.IDLE)

    # Path information
    current_path: Optional[List[str]] = None # List of node IDs forming the path
    path_cost: Optional[float] = None # Total estimated time for current_path

# --- Output Models ---
class TrafficLightTiming(BaseModel):
    intersection_id: str
    green_times: Dict[str, int] # road_id entering intersection -> green_seconds

class SuggestedRoute(BaseModel):
    vehicle_id: Optional[str] = None
    path: List[str]
    estimated_travel_time: float

class SystemState(BaseModel):
    routes: List[SuggestedRoute] # This might become less relevant if vehicles directly report paths
    traffic_lights: List[TrafficLightTiming]
    vehicles: List[Vehicle] # Add vehicles to system state
    simulation_time: float # Current simulated time