import networkx as nx
from typing import List, Optional, Tuple, Dict # Added Dict
from app.core import graph_manager # Import module itself
from app.models import SuggestedRoute, Vehicle, VehicleStateEnum # Added Vehicle, VehicleStateEnum

# This will store active vehicles. In a real system, this would be a database.
# ACTIVE_VEHICLES_DB: Dict[str, Vehicle] = {} # Moved to main.py or a dedicated simulation manager

def find_fastest_path(start_node_id: str, end_node_id: str) -> Optional[Tuple[List[str], float]]:
    graph = graph_manager.get_graph_copy()
    if not graph.has_node(start_node_id) or not graph.has_node(end_node_id):
        print(f"Error: Start or end node not in graph. Start: {start_node_id}, End: {end_node_id}")
        return None
    try:
        # Use 'current_travel_time' which is updated by traffic conditions
        path = nx.dijkstra_path(graph, source=start_node_id, target=end_node_id, weight='current_travel_time')
        cost = nx.dijkstra_path_length(graph, source=start_node_id, target=end_node_id, weight='current_travel_time')
        return path, cost
    except nx.NetworkXNoPath:
        print(f"No path found from {start_node_id} to {end_node_id}")
        return None
    except nx.NodeNotFound: # Should be caught by initial check, but good practice
        print(f"Node not found during pathfinding (should not happen). Start: {start_node_id}, End: {end_node_id}")
        return None


def assign_route_to_vehicle(vehicle: Vehicle, vehicles_db: Dict[str, Vehicle]) -> bool:
    """
    Calculates and assigns a route to a vehicle.
    Updates the vehicle object in vehicles_db.
    Returns True if successful, False otherwise.
    """
    if not vehicle.current_node_id or not vehicle.destination_node_id:
        print(f"Vehicle {vehicle.id} missing current or destination node for routing.")
        return False

    path_info = find_fastest_path(vehicle.current_node_id, vehicle.destination_node_id)
    if path_info:
        path, cost = path_info
        vehicle.current_path = path
        vehicle.path_cost = cost
        vehicle.current_path_index = 0 # Start at the beginning of the new path
        vehicle.time_on_current_segment = 0.0
        vehicle.state = VehicleStateEnum.ON_ROUTE if len(path) > 1 else VehicleStateEnum.ARRIVED # If path is just current node
        
        # Remove from old road if it was on one (handled by simulation step now)
        # Add to new road (handled by simulation step now)
        
        vehicles_db[vehicle.id] = vehicle # Ensure the DB is updated with the new path
        print(f"Route assigned to vehicle {vehicle.id}: {path} with cost {cost:.2f}")
        return True
    else:
        print(f"Could not find path for vehicle {vehicle.id} from {vehicle.current_node_id} to {vehicle.destination_node_id}")
        vehicle.current_path = None
        vehicle.path_cost = None
        vehicle.state = VehicleStateEnum.IDLE # Or some error state
        vehicles_db[vehicle.id] = vehicle
        return False

# Rerouting logic will now be:
# 1. Vehicle becomes IDLE (e.g., due to massive unexpected delay or manual trigger).
# 2. Simulation or an API call triggers assign_route_to_vehicle for it.
# The find_fastest_path always uses current graph state.