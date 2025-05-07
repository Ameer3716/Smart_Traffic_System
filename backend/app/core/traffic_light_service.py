from typing import Dict, List
from app.core.graph_manager import get_roads_entering_intersection, ROAD_DATA, CITY_GRAPH,Optional
from app.models import TrafficLightTiming

# Basic traffic light control logic
# This is a placeholder for more sophisticated logic (e.g., dynamic programming, adaptive algorithms)

# Example: Store cycle information per intersection
# { "intersection_id": {"current_phase_index": 0, "phases": [{"road_id_green": "A-X", "duration": 30}, ...]} }
INTERSECTION_PHASES: Dict[str, Dict] = {} 

MIN_GREEN_TIME = 10  # seconds
MAX_GREEN_TIME = 60  # seconds
DEFAULT_CYCLE_TIME = 90 # Total time for all phases at an intersection

def initialize_traffic_lights():
    """Initializes basic phase information for all intersections."""
    global INTERSECTION_PHASES
    INTERSECTION_PHASES.clear()
    if not CITY_GRAPH: # Ensure graph is loaded
        return

    for node_id in CITY_GRAPH.nodes():
        # This is a very simplified phase generation.
        # Real intersections have complex phasing (left turns, pedestrian, etc.)
        # Here, we just alternate between major road groups if possible.
        # For now, let's just identify roads and assign a default.
        # A true DP or adaptive system would be much more involved.
        # We will use a simpler heuristic: green time proportional to demand.
        INTERSECTION_PHASES[node_id] = {
            "timings_dirty": True, # Flag to recalculate
            "last_calculated_timings": {} # Store last calculated for output
        }
    print(f"Traffic light controllers initialized for {len(INTERSECTION_PHASES)} intersections.")


def calculate_adaptive_timings(intersection_id: str) -> Dict[str, int]:
    """
    Calculates green light timings for an intersection based on current demand.
    This is a heuristic, not full DP, but adaptive.
    Returns: Dict mapping incoming road_id (e.g., "A-X") to green time.
    """
    if intersection_id not in CITY_GRAPH.nodes():
        return {}

    incoming_roads = get_roads_entering_intersection(intersection_id)
    if not incoming_roads:
        return {}

    demand = {} # road_id -> demand_score (e.g., vehicle count or congestion * base_time)
    total_demand_score = 0

    for u, v in incoming_roads: # u is source, v is the intersection_id
        road_key = (u,v)
        if road_key in ROAD_DATA:
            # Demand score can be vehicle count, or weighted by congestion
            # Simple: use vehicle count
            vehicle_count = ROAD_DATA[road_key].get("current_vehicles", 0)
            # A more sensitive score:
            # congestion = ROAD_DATA[road_key].get("current_congestion", 0)
            # base_time = ROAD_DATA[road_key].get("base_travel_time", 1)
            # score = vehicle_count * (1 + congestion) # Higher score for more congested roads
            score = vehicle_count
            
            demand[f"{u}-{v}"] = score
            total_demand_score += score
        else:
            demand[f"{u}-{v}"] = 0


    timings: Dict[str, int] = {}
    if total_demand_score == 0: # No traffic, assign default minimums or equal share
        if incoming_roads:
            equal_time = max(MIN_GREEN_TIME, DEFAULT_CYCLE_TIME // len(incoming_roads))
            for u,v in incoming_roads:
                timings[f"{u}-{v}"] = min(equal_time, MAX_GREEN_TIME)
    else:
        for road_id_str, score in demand.items():
            proportion = score / total_demand_score
            green_time = int(proportion * DEFAULT_CYCLE_TIME) # Total cycle time for this "phase group"
            timings[road_id_str] = max(MIN_GREEN_TIME, min(green_time, MAX_GREEN_TIME))
    
    # This simple model assumes all incoming roads can be green somewhat independently
    # or grouped. A real system uses fixed phases (e.g. NS green, EW green).
    # For a fixed phase system:
    # 1. Define phases (e.g., "NS_roads_green", "EW_roads_green").
    # 2. Sum demand for roads in each phase.
    # 3. Allocate DEFAULT_CYCLE_TIME proportionally to phase demands.
    
    # For now, let's assume the above `timings` dict is what we want.
    if intersection_id in INTERSECTION_PHASES: # Should always be true after init
        INTERSECTION_PHASES[intersection_id]["last_calculated_timings"] = timings
        INTERSECTION_PHASES[intersection_id]["timings_dirty"] = False

    return timings


def get_traffic_light_timings_for_intersection(intersection_id: str) -> Optional[TrafficLightTiming]:
    if intersection_id not in INTERSECTION_PHASES:
        initialize_traffic_lights() # Attempt to initialize if not done
    
    if intersection_id not in INTERSECTION_PHASES: # Still not found
         print(f"Intersection {intersection_id} not found for traffic lights.")
         return None

    # Recalculate if marked dirty or if no timings exist yet
    # In a real system, this would be triggered by traffic updates periodically
    # if INTERSECTION_PHASES[intersection_id]["timings_dirty"] or \
    #    not INTERSECTION_PHASES[intersection_id]["last_calculated_timings"]:
    calculated_timings = calculate_adaptive_timings(intersection_id)
    # else:
    #    calculated_timings = INTERSECTION_PHASES[intersection_id]["last_calculated_timings"]
    
    if calculated_timings:
        return TrafficLightTiming(intersection_id=intersection_id, green_times=calculated_timings)
    return None


def get_all_traffic_light_timings() -> List[TrafficLightTiming]:
    all_timings = []
    if not INTERSECTION_PHASES and CITY_GRAPH.nodes(): # Initialize if empty but graph exists
        initialize_traffic_lights()
        
    for intersection_id in CITY_GRAPH.nodes(): # Iterate over actual graph nodes
        timings = get_traffic_light_timings_for_intersection(intersection_id)
        if timings:
            all_timings.append(timings)
    return all_timings

def mark_all_lights_dirty():
    """ Call this after significant traffic updates to force recalculation. """
    for data in INTERSECTION_PHASES.values():
        data["timings_dirty"] = True