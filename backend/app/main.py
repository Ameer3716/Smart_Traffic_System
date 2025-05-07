from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware # For frontend interaction
from typing import List, Dict
from fastapi.responses import StreamingResponse # For optional image endpoint

from app.models import (
    CityMap, TrafficUpdate, RouteRequest, SuggestedRoute,
    TrafficLightTiming, SystemState, Vehicle
)
from app.core import graph_manager, routing_service, traffic_light_service

app = FastAPI(title="Smart Traffic Management System API")

# Allow CORS for frontend development (adjust origins in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Or specific frontend URL like "http://localhost:5173"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- State Management (simple in-memory for this example) ---
# In a real app, this would be more robust, possibly involving a database
# or a dedicated state management class.
VEHICLES_DB: Dict[str, Vehicle] = {} # vehicle_id -> Vehicle object

@app.on_event("startup")
async def startup_event():
    # You can load a default map here if you want
    print("Smart Traffic API started.")
    # graph_manager.load_map(...) # Example: load a default map
    traffic_light_service.initialize_traffic_lights()


# --- API Endpoints ---
@app.post("/map/load", status_code=201)
async def load_city_map(city_map: CityMap):
    """
    Loads or reloads the city map.
    Req 1: Process Input Data, Req 2: Model the City Network
    """
    if graph_manager.load_map(city_map):
        traffic_light_service.initialize_traffic_lights() # Re-init lights for new map
        routing_service.ACTIVE_VEHICLES.clear() # Clear old routes
        VEHICLES_DB.clear() # Clear old vehicle states
        return {"message": "City map loaded successfully."}
    else:
        raise HTTPException(status_code=500, detail="Failed to load city map.")

@app.put("/traffic/update", status_code=200)
async def update_road_traffic(updates: List[TrafficUpdate]):
    """
    Updates traffic conditions on one or more roads.
    Req 1: Process Input Data (Live Traffic)
    """
    results = []
    updated_something = False
    for update in updates:
        if graph_manager.update_traffic_on_road(update.road_id, 
                                                congestion_level=update.congestion_level, 
                                                vehicle_count=getattr(update, 'vehicle_count', None)):
            results.append({"road_id": update.road_id, "status": "updated"})
            updated_something = True
        else:
            results.append({"road_id": update.road_id, "status": "failed or road not found"})
    
    if updated_something:
        traffic_light_service.mark_all_lights_dirty() # Signal lights to potentially recalculate

    if not any(r["status"] == "updated" for r in results):
        raise HTTPException(status_code=400, detail="No roads were successfully updated. Check road_ids.")
    return {"message": "Traffic update processed.", "details": results}

@app.post("/routes/request", response_model=SuggestedRoute)
async def request_new_route(route_req: RouteRequest):
    """
    Calculates the fastest route for a vehicle.
    Req 3: Calculate Fastest Routes
    """
    # Update vehicle's known location if it's an existing vehicle
    if route_req.vehicle_id and route_req.vehicle_id in VEHICLES_DB:
        VEHICLES_DB[route_req.vehicle_id].current_node_id = route_req.start_node_id
        VEHICLES_DB[route_req.vehicle_id].destination_node_id = route_req.end_node_id
    
    suggested_route = routing_service.request_route_for_vehicle(
        vehicle_id=route_req.vehicle_id or f"anon_vehicle_{len(routing_service.ACTIVE_VEHICLES) + 1}",
        start_node_id=route_req.start_node_id,
        end_node_id=route_req.end_node_id
    )
    if not suggested_route:
        raise HTTPException(status_code=404, detail="No path found or invalid nodes.")
    
    # Update vehicle state if it's tracked
    if route_req.vehicle_id and route_req.vehicle_id in VEHICLES_DB:
        VEHICLES_DB[route_req.vehicle_id].current_path = suggested_route.path
        VEHICLES_DB[route_req.vehicle_id].path_cost = suggested_route.estimated_travel_time
        
    return suggested_route

@app.post("/routes/reroute/{vehicle_id}", response_model=SuggestedRoute)
async def reroute_vehicle(vehicle_id: str, current_node_id: str = Body(..., embed=True)):
    """
    Reroutes an existing vehicle from its new current location if its path is suboptimal.
    Req 5: Develop Vehicle Rerouting Logic
    """
    if vehicle_id not in VEHICLES_DB and vehicle_id not in routing_service.ACTIVE_VEHICLES:
         raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found.")

    # If the vehicle is tracked, update its current node
    if vehicle_id in VEHICLES_DB:
        VEHICLES_DB[vehicle_id].current_node_id = current_node_id
    
    # The routing_service.reroute_vehicle_if_needed will handle ACTIVE_VEHICLES
    # It will use the destination from the original path stored in ACTIVE_VEHICLES
    suggested_route = routing_service.reroute_vehicle_if_needed(vehicle_id, current_node_id)
    
    if not suggested_route:
        # This could mean no better route, or no path at all from new location
        # For simplicity, if reroute_vehicle_if_needed returns None, assume no path or error
        raise HTTPException(status_code=404, detail=f"Could not reroute vehicle {vehicle_id}. No path or error.")

    # Update vehicle state if it's tracked
    if vehicle_id in VEHICLES_DB:
        VEHICLES_DB[vehicle_id].current_path = suggested_route.path
        VEHICLES_DB[vehicle_id].path_cost = suggested_route.estimated_travel_time
        
    return suggested_route


@app.get("/traffic-lights", response_model=List[TrafficLightTiming])
async def get_all_light_timings():
    """
    Gets current timings for all traffic lights.
    Req 4: Develop Traffic Light Control Logic, Req 8: Generate Clear Outputs
    """
    timings = traffic_light_service.get_all_traffic_light_timings()
    return timings

@app.get("/traffic-lights/{intersection_id}", response_model=TrafficLightTiming)
async def get_light_timings_for_intersection(intersection_id: str):
    """
    Gets current timings for a specific traffic light.
    Req 4: Develop Traffic Light Control Logic
    """
    timing = traffic_light_service.get_traffic_light_timings_for_intersection(intersection_id)
    if not timing:
        raise HTTPException(status_code=404, detail=f"Intersection {intersection_id} not found or no timings available.")
    return timing

# Req 6: Address Vehicle Routing Complexity & Req 7: Integrate Components
@app.get("/system/state", response_model=SystemState)
async def get_current_system_state():
    """
    Returns a snapshot of the current system state including routes and light timings.
    Demonstrates integration.
    """
    routes = routing_service.get_all_active_routes()
    lights = traffic_light_service.get_all_traffic_light_timings()
    return SystemState(routes=routes, traffic_lights=lights)

@app.post("/vehicles", response_model=Vehicle, status_code=201)
async def add_vehicle(vehicle: Vehicle):
    """Manages multiple vehicles (Req 6). Adds a new vehicle to track."""
    if vehicle.id in VEHICLES_DB:
        raise HTTPException(status_code=400, detail=f"Vehicle with ID {vehicle.id} already exists.")
    VEHICLES_DB[vehicle.id] = vehicle
    
    # Optionally, immediately request a route for it
    if vehicle.current_node_id and vehicle.destination_node_id:
        route_info = routing_service.request_route_for_vehicle(
            vehicle.id, vehicle.current_node_id, vehicle.destination_node_id
        )
        if route_info:
            vehicle.current_path = route_info.path
            vehicle.path_cost = route_info.estimated_travel_time
            VEHICLES_DB[vehicle.id] = vehicle # Update with path info
    return vehicle

@app.get("/vehicles", response_model=List[Vehicle])
async def get_all_vehicles():
    """Retrieves all tracked vehicles and their current state."""
    return list(VEHICLES_DB.values())

@app.get("/vehicles/{vehicle_id}", response_model=Vehicle)
async def get_vehicle_details(vehicle_id: str):
    """Retrieves a specific tracked vehicle."""
    if vehicle_id not in VEHICLES_DB:
        raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found.")
    return VEHICLES_DB[vehicle_id]

@app.get("/map/roads/conditions")
async def get_road_conditions():
    """Returns current travel time and congestion for all roads."""
    return graph_manager.get_current_road_conditions()

# To run: uvicorn app.main:app --reload --port 8000
# (Assuming you are in the `backend` directory)