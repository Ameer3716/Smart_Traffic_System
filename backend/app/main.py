from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Optional

from app.models import (
    CityMap, TrafficUpdate, RouteRequest, SuggestedRoute,
    TrafficLightTiming, SystemState, Vehicle, VehicleStateEnum
)
from app.core import graph_manager, routing_service, traffic_light_service, simulation_manager

app = FastAPI(title="Smart Traffic Management System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory database for vehicles (passed to simulation_manager)
VEHICLES_DB: Dict[str, Vehicle] = {}

@app.on_event("startup")
async def startup_event():
    print("Smart Traffic API starting up...")
    # Load a default map if desired, e.g.:
    # from app.data.load_default_map import default_map_data # You'd create this
    # if graph_manager.load_map(CityMap(**default_map_data)):
    #     traffic_light_service.initialize_traffic_lights()
    simulation_manager.initialize_simulation(VEHICLES_DB)
    simulation_manager.start_simulation_task() # Start the simulation loop
    print("Smart Traffic API startup complete.")

@app.on_event("shutdown")
async def shutdown_event():
    print("Smart Traffic API shutting down...")
    simulation_manager.stop_simulation_task()
    # Give the simulation task a moment to finish
    if simulation_manager.simulation_task and not simulation_manager.simulation_task.done():
        try:
            await asyncio.wait_for(simulation_manager.simulation_task, timeout=5.0)
        except asyncio.TimeoutError:
            print("Simulation task did not finish in time, cancelling.")
            simulation_manager.simulation_task.cancel()
    print("Smart Traffic API shutdown complete.")


@app.post("/map/load", status_code=201)
async def load_city_map(city_map_data: CityMap): # Renamed for clarity
    if graph_manager.load_map(city_map_data):
        traffic_light_service.initialize_traffic_lights()
        # Clear vehicles or re-evaluate their positions based on new map?
        # For simplicity, let's clear them for now.
        global VEHICLES_DB
        # Before clearing, ensure vehicles are removed from old road counts
        for v_id, v_obj in list(VEHICLES_DB.items()):
            if v_obj.current_road_segment:
                graph_manager.update_road_vehicle_count(v_obj.current_road_segment, -1)
        VEHICLES_DB.clear() 
        simulation_manager.SIMULATION_TIME = 0.0 # Reset sim time
        return {"message": "City map loaded successfully. Existing vehicles cleared."}
    else:
        raise HTTPException(status_code=500, detail="Failed to load city map.")

@app.put("/traffic/update", status_code=200) # Manual traffic update
async def update_road_traffic_manual(updates: List[TrafficUpdate]):
    results = []
    updated_something = False
    for update in updates:
        # This manual update will set congestion directly OR derive from vehicle_count
        if graph_manager.update_traffic_on_road(
            update.road_id, 
            congestion_level=update.congestion_level, 
            vehicle_count=getattr(update, 'vehicle_count', None) # Use getattr for optional field
        ):
            results.append({"road_id": update.road_id, "status": "updated"})
            updated_something = True
        else:
            results.append({"road_id": update.road_id, "status": "failed or road not found"})
    
    if updated_something:
        traffic_light_service.mark_all_lights_dirty()
    return {"message": "Manual traffic update processed.", "details": results}


@app.post("/vehicles", response_model=Vehicle, status_code=201)
async def add_vehicle_endpoint(vehicle_data: RouteRequest): # Use RouteRequest to define start/end
    vehicle_id = vehicle_data.vehicle_id or f"veh_{len(VEHICLES_DB) + int(time.time())%10000}"
    if vehicle_id in VEHICLES_DB:
        raise HTTPException(status_code=400, detail=f"Vehicle with ID {vehicle_id} already exists.")

    if not graph_manager.CITY_GRAPH.has_node(vehicle_data.start_node_id) or \
       not graph_manager.CITY_GRAPH.has_node(vehicle_data.end_node_id):
        raise HTTPException(status_code=404, detail="Start or end node for vehicle not found in map.")

    new_vehicle = Vehicle(
        id=vehicle_id,
        start_node_id=vehicle_data.start_node_id,
        destination_node_id=vehicle_data.end_node_id,
        current_node_id=vehicle_data.start_node_id, # Starts at its start_node_id
        state=VehicleStateEnum.IDLE # Will be routed by simulation or next call
    )
    VEHICLES_DB[vehicle_id] = new_vehicle
    
    # Attempt initial routing immediately (optional, sim loop can also pick it up)
    # routing_service.assign_route_to_vehicle(new_vehicle, VEHICLES_DB)
    print(f"Vehicle {vehicle_id} added. State: {new_vehicle.state}. Current node: {new_vehicle.current_node_id}")
    return new_vehicle

@app.post("/vehicles/{vehicle_id}/reroute", response_model=Vehicle)
async def reroute_vehicle_endpoint(vehicle_id: str, new_start_node_id: Optional[str] = Body(None, embed=True)):
    if vehicle_id not in VEHICLES_DB:
        raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found.")
    
    vehicle = VEHICLES_DB[vehicle_id]
    
    # If vehicle was on a road, remove it from that road's count
    if vehicle.current_road_segment:
        graph_manager.update_road_vehicle_count(vehicle.current_road_segment, -1)
        vehicle.current_road_segment = None

    vehicle.state = VehicleStateEnum.IDLE
    if new_start_node_id and graph_manager.CITY_GRAPH.has_node(new_start_node_id):
        vehicle.current_node_id = new_start_node_id
    # If no new_start_node_id, it will try to reroute from its last known current_node_id
    
    vehicle.current_path = None # Clear old path
    vehicle.current_path_index = 0
    vehicle.time_on_current_segment = 0.0
    
    # The simulation loop will pick up IDLE vehicles and try to assign_route_to_vehicle
    # Or, we can trigger it here:
    if routing_service.assign_route_to_vehicle(vehicle, VEHICLES_DB):
        return vehicle
    else:
        # Keep it IDLE if routing failed, sim loop might try again later
        VEHICLES_DB[vehicle_id] = vehicle # Save state changes
        raise HTTPException(status_code=500, detail=f"Failed to find a new route for vehicle {vehicle_id} immediately. It remains IDLE.")


@app.get("/vehicles", response_model=List[Vehicle])
async def get_all_vehicles_endpoint():
    return list(VEHICLES_DB.values())

@app.get("/vehicles/{vehicle_id}", response_model=Vehicle)
async def get_vehicle_details_endpoint(vehicle_id: str):
    if vehicle_id not in VEHICLES_DB:
        raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found.")
    return VEHICLES_DB[vehicle_id]


@app.get("/traffic-lights", response_model=List[TrafficLightTiming])
async def get_all_light_timings_endpoint():
    timings = traffic_light_service.get_all_traffic_light_timings()
    return timings

@app.get("/system/state", response_model=SystemState)
async def get_current_system_state_endpoint():
    # Suggested routes are now part of individual vehicle objects
    # We can compile a list of routes from active vehicles if needed for this specific output
    active_routes = []
    for v_id, v_obj in VEHICLES_DB.items():
        if v_obj.current_path and v_obj.state == VehicleStateEnum.ON_ROUTE:
            active_routes.append(SuggestedRoute(
                vehicle_id=v_id,
                path=v_obj.current_path,
                estimated_travel_time=v_obj.path_cost or 0.0 # path_cost might be stale after partial travel
            ))

    lights = traffic_light_service.get_all_traffic_light_timings()
    return SystemState(
        routes=active_routes, # Or remove routes from SystemState model if vehicles list is enough
        traffic_lights=lights,
        vehicles=list(VEHICLES_DB.values()),
        simulation_time=simulation_manager.get_simulation_time()
    )

@app.get("/map/roads/conditions")
async def get_road_conditions_endpoint():
    return graph_manager.get_current_road_conditions()

# Placeholder for a default map if you want to load one on startup
# You would create a maps.py or similar in app/data/
# from app.data import maps
# @app.on_event("startup")
# async def startup_event_load_map():
#     if graph_manager.load_map(CityMap(**maps.BASIC_MAP)):
#        traffic_light_service.initialize_traffic_lights()
#        simulation_manager.initialize_simulation(VEHICLES_DB)
#        simulation_manager.start_simulation_task()