import networkx as nx
from typing import List, Optional, Tuple
from app.core.graph_manager import get_graph_copy, ROAD_DATA,Dict # CITY_GRAPH is managed there
from app.models import SuggestedRoute

# This will store active vehicles and their assigned routes
# In a real system, this would be a database or a more robust in-memory store
ACTIVE_VEHICLES: Dict[str, Tuple[List[str], float]] = {} # vehicle_id -> (path, cost)

def find_fastest_path(start_node_id: str, end_node_id: str) -> Optional[Tuple[List[str], float]]:
    """
    Finds the fastest path using Dijkstra's algorithm on current_travel_time.
    Returns (path, total_travel_time) or None if no path.
    """
    graph = get_graph_copy() # Work on a copy with current weights
    if not graph.has_node(start_node_id) or not graph.has_node(end_node_id):
        print(f"Error: Start or end node not in graph. Start: {start_node_id}, End: {end_node_id}")
        return None
    try:
        path = nx.dijkstra_path(graph, source=start_node_id, target=end_node_id, weight='current_travel_time')
        cost = nx.dijkstra_path_length(graph, source=start_node_id, target=end_node_id, weight='current_travel_time')
        return path, cost
    except nx.NetworkXNoPath:
        print(f"No path found from {start_node_id} to {end_node_id}")
        return None
    except nx.NodeNotFound:
        print(f"Node not found during pathfinding. Start: {start_node_id}, End: {end_node_id}")
        return None


def request_route_for_vehicle(vehicle_id: str, start_node_id: str, end_node_id: str) -> Optional[SuggestedRoute]:
    """
    Calculates a route, stores it for the vehicle, and returns the suggestion.
    """
    path_info = find_fastest_path(start_node_id, end_node_id)
    if path_info:
        path, cost = path_info
        ACTIVE_VEHICLES[vehicle_id] = (path, cost)
        # Simulate vehicle occupying the first segment (optional, advanced)
        # if len(path) > 1:
        #     first_road_key = (path[0], path[1])
        #     if first_road_key in ROAD_DATA:
        #         ROAD_DATA[first_road_key]["current_vehicles"] += 1
        #         # graph_manager.update_traffic_on_road(...) could be called here
        return SuggestedRoute(vehicle_id=vehicle_id, path=path, estimated_travel_time=cost)
    return None

def reroute_vehicle_if_needed(vehicle_id: str, new_start_node_id: str) -> Optional[SuggestedRoute]:
    """
    Checks if a vehicle's current path is still optimal or needs rerouting
    from its new_start_node_id.
    For simplicity, this example always reroutes. A more complex check would compare
    current path cost vs new potential path cost from new_start_node_id.
    """
    if vehicle_id not in ACTIVE_VEHICLES:
        print(f"Vehicle {vehicle_id} not found for rerouting.")
        return None

    _current_path, _current_cost = ACTIVE_VEHICLES[vehicle_id]
    # The destination is the last node in the original path
    destination_node_id = _current_path[-1]

    # For simulation, assume the vehicle made it to new_start_node_id
    # And now we recalculate from there
    print(f"Rerouting vehicle {vehicle_id} from {new_start_node_id} to {destination_node_id}")
    return request_route_for_vehicle(vehicle_id, new_start_node_id, destination_node_id)


def get_all_active_routes() -> List[SuggestedRoute]:
    routes = []
    for vehicle_id, (path, cost) in ACTIVE_VEHICLES.items():
        # Assuming the path doesn't change unless rerouted.
        # In a real sim, current_node_id would update.
        routes.append(SuggestedRoute(vehicle_id=vehicle_id, path=path, estimated_travel_time=cost))
    return routes

# Req 6: Strategy for multiple vehicles
# Current strategy: Each vehicle is routed independently using the current shortest path.
# This is a common baseline. Enhancements could include:
# 1. Capacity-aware routing: Penalize paths nearing capacity more heavily.
# 2. Staggered routing: Don't route all vehicles simultaneously if many requests come in.
# 3. Look-ahead: If multiple vehicles request routes, simulate their impact on traffic before assigning the Nth route.
# For this project, independent routing is a good starting point.
# The `ACTIVE_VEHICLES` and updating `ROAD_DATA` with `current_vehicles` starts to form this.
# When `update_traffic_on_road` considers `vehicle_count`, it inherently makes the graph
# react to multiple vehicles over time.