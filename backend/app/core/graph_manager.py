import networkx as nx
from typing import List, Dict, Tuple, Optional
from app.models import CityMap, Node as ModelNode, Edge as ModelEdge

CITY_GRAPH = nx.DiGraph()
ROAD_DATA: Dict[Tuple[str, str], Dict] = {} # (source, target) -> {data}

def load_map(city_map: CityMap):
    global CITY_GRAPH, ROAD_DATA
    CITY_GRAPH.clear()
    ROAD_DATA.clear()

    for node_data in city_map.nodes:
        CITY_GRAPH.add_node(node_data.id, name=node_data.name, x=node_data.x, y=node_data.y)

    for edge_data in city_map.edges:
        source, target = edge_data.source, edge_data.target
        base_time = edge_data.base_travel_time
        capacity = edge_data.capacity

        # Add edge with initial travel time same as base_travel_time
        CITY_GRAPH.add_edge(source, target, base_travel_time=base_time, current_travel_time=base_time)
        ROAD_DATA[(source, target)] = {
            "base_travel_time": base_time,
            "capacity": capacity or 100, # Default capacity if not provided
            "current_congestion": 0.0,
            "current_vehicles": 0 # Initialize vehicle count
        }
    print(f"Map loaded: {CITY_GRAPH.number_of_nodes()} nodes, {CITY_GRAPH.number_of_edges()} edges.")
    return True

def get_graph_copy():
    return CITY_GRAPH.copy()

def update_road_vehicle_count(road_segment: Tuple[str, str], delta: int):
    """
    Updates vehicle count on a road segment and recalculates its travel time.
    delta: +1 if vehicle enters, -1 if vehicle leaves.
    """
    source, target = road_segment
    road_key = (source, target)

    if road_key not in ROAD_DATA:
        print(f"Warning: Road data for {source}-{target} not found during vehicle count update.")
        # If this happens, it's likely an issue with map loading or vehicle pathing
        # For robustness, we could try to initialize it here, but it's better to ensure it's loaded.
        if CITY_GRAPH.has_edge(source, target):
            base_time = CITY_GRAPH.edges[source, target].get('base_travel_time', 10)
            ROAD_DATA[road_key] = {
                "base_travel_time": base_time, "capacity": 100,
                "current_congestion": 0.0, "current_vehicles": 0
            }
        else: # Road doesn't exist in graph, severe issue
            print(f"CRITICAL: Edge {source}-{target} does not exist in graph. Cannot update vehicle count.")
            return

    ROAD_DATA[road_key]["current_vehicles"] = max(0, ROAD_DATA[road_key]["current_vehicles"] + delta)
    
    # Recalculate congestion and travel time based on new vehicle count
    update_traffic_on_road(
        f"{source}-{target}", 
        vehicle_count=ROAD_DATA[road_key]["current_vehicles"]
    )

def update_traffic_on_road(road_id_str: str, congestion_level: Optional[float] = None, vehicle_count: Optional[int] = None):
    global CITY_GRAPH, ROAD_DATA
    try:
        source, target = road_id_str.split('-')
    except ValueError:
        print(f"Invalid road_id format: {road_id_str}.")
        return False

    if not CITY_GRAPH.has_edge(source, target):
        # print(f"Road {source}-{target} not found in graph for traffic update.") # Can be noisy
        return False

    road_key = (source, target)
    if road_key not in ROAD_DATA: # Should be initialized by load_map or update_road_vehicle_count
         print(f"Warning: Road data for {road_key} not found, initializing with defaults.")
         base_time = CITY_GRAPH.edges[source,target].get('base_travel_time',10)
         capacity = 100 # Default capacity
         ROAD_DATA[road_key] = {
            "base_travel_time": base_time, "capacity": capacity,
            "current_congestion": 0.0, "current_vehicles": 0
        }


    if vehicle_count is not None:
        ROAD_DATA[road_key]["current_vehicles"] = max(0, vehicle_count) # Ensure non-negative
        # Derive congestion from vehicle_count and capacity
        capacity = ROAD_DATA[road_key]["capacity"]
        if capacity > 0:
            # More sensitive congestion: consider capacity fully utilized at capacity, rapidly increases after
            # Example: if vehicle_count = capacity, congestion = 0.5. If vehicle_count = 1.5*capacity, congestion = 1.0
            # This needs tuning. Original: min(1.0, vehicle_count / (capacity * 1.5))
            # Let's try:
            if vehicle_count <= capacity:
                derived_congestion = (vehicle_count / capacity) * 0.6 # Max 0.6 congestion up to capacity
            else:
                # Faster increase beyond capacity
                over_capacity_ratio = (vehicle_count - capacity) / (capacity * 0.5) # 0.5 means jam at 1.5x capacity
                derived_congestion = 0.6 + (0.4 * min(1.0, over_capacity_ratio))
            
            ROAD_DATA[road_key]["current_congestion"] = min(1.0, max(0.0, derived_congestion))

        else: # Zero capacity road (should not happen for drivable roads)
            ROAD_DATA[road_key]["current_congestion"] = 1.0 if ROAD_DATA[road_key]["current_vehicles"] > 0 else 0.0
    elif congestion_level is not None:
        ROAD_DATA[road_key]["current_congestion"] = max(0.0, min(1.0, congestion_level))
        # Note: If only congestion_level is given, current_vehicles might become out of sync.
        # Prefer updating via vehicle_count for the simulation.

    base_time = ROAD_DATA[road_key]["base_travel_time"]
    congestion = ROAD_DATA[road_key]["current_congestion"]
    
    # Cost function: base_time * (1 + k * congestion^alpha)
    # Simple linear: penalty_factor = 1 + (4 * congestion) 
    # More aggressive (exponential-like effect):
    if congestion < 0.99: # Avoid division by zero
        penalty_factor = 1 / (1 - congestion * 0.9) # e.g. congestion 0.5 -> 1.8x, cong 0.8 -> 3.5x, cong 0.9 -> 5.2x
    else:
        penalty_factor = 20 # Max penalty for fully congested

    current_travel_time = base_time * penalty_factor
    CITY_GRAPH.edges[source, target]['current_travel_time'] = current_travel_time
    
    # This print can be very noisy during simulation
    # print(f"Road {source}-{target} updated: Vehicles {ROAD_DATA[road_key]['current_vehicles']}, Congestion {congestion:.2f}, New Travel Time {current_travel_time:.2f}")
    return True


def get_current_road_conditions() -> Dict[str, Dict]:
    conditions = {}
    for (u,v), data in ROAD_DATA.items():
        road_id = f"{u}-{v}"
        if CITY_GRAPH.has_edge(u,v): # Ensure edge exists
            conditions[road_id] = {
                "base_travel_time": data["base_travel_time"],
                "current_congestion": data["current_congestion"],
                "current_vehicles": data["current_vehicles"],
                "current_travel_time": CITY_GRAPH.edges[u,v]['current_travel_time']
            }
        else: # Should not happen if map is loaded correctly
            conditions[road_id] = {
                "base_travel_time": data.get("base_travel_time",0),
                "current_congestion": data.get("current_congestion",1.0),
                "current_vehicles": data.get("current_vehicles",0),
                "current_travel_time": data.get("base_travel_time", float('inf')) # Indicate issue
            }
    return conditions

def get_roads_entering_intersection(intersection_id: str) -> List[Tuple[str, str]]:
    if not CITY_GRAPH.has_node(intersection_id):
        return []
    return [(u, v) for u, v in CITY_GRAPH.in_edges(intersection_id)]

def get_roads_leaving_intersection(intersection_id: str) -> List[Tuple[str, str]]:
     if not CITY_GRAPH.has_node(intersection_id):
        return []
     return [(u, v) for u, v in CITY_GRAPH.out_edges(intersection_id)]