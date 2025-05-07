# backend/app/core/simulation_manager.py
import asyncio
import time
from typing import Dict
from app.models import Vehicle, VehicleStateEnum
from app.core import graph_manager, routing_service # graph_manager for road data, routing_service for pathfinding

SIMULATION_STEP_INTERVAL_SECONDS = 1  # How often the simulation advances (e.g., 1 real second = X sim seconds)
SIMULATION_TIME_MULTIPLIER = 5 # How many simulated seconds pass for each SIMULATION_STEP_INTERVAL_SECONDS
                               # e.g., 1 real second = 5 simulated seconds of vehicle movement

# This DB will be passed from main.py
VEHICLES_DB: Dict[str, Vehicle] = {}
SIMULATION_TIME: float = 0.0 # Total simulated seconds passed
simulation_task = None
_stop_simulation = False

def initialize_simulation(vehicles_db_ref: Dict[str, Vehicle]):
    global VEHICLES_DB, SIMULATION_TIME, _stop_simulation
    VEHICLES_DB = vehicles_db_ref
    SIMULATION_TIME = 0.0
    _stop_simulation = False
    print("Simulation Manager Initialized.")

async def simulation_loop():
    global SIMULATION_TIME, _stop_simulation
    print("Simulation loop started.")
    last_real_time = time.monotonic()

    while not _stop_simulation:
        current_real_time = time.monotonic()
        real_time_delta = current_real_time - last_real_time
        last_real_time = current_real_time

        # Advance simulation time
        # We aim for SIMULATION_STEP_INTERVAL_SECONDS in real time
        # If loop takes longer, this will catch up.
        # If loop is faster, asyncio.sleep will pace it.
        simulated_time_this_step = SIMULATION_TIME_MULTIPLIER * real_time_delta # More accurate based on real time
        # OR: fixed step if always sleeping for SIMULATION_STEP_INTERVAL_SECONDS
        # simulated_time_this_step = SIMULATION_TIME_MULTIPLIER * SIMULATION_STEP_INTERVAL_SECONDS

        SIMULATION_TIME += simulated_time_this_step
        # print(f"Sim Time: {SIMULATION_TIME:.2f} (+{simulated_time_this_step:.2f})")

        await update_vehicle_positions(simulated_time_this_step)

        # Check for rerouting needs (simplified: if vehicle is IDLE and has a destination)
        for vehicle_id, vehicle in list(VEHICLES_DB.items()): # list() for safe iteration if modifying
            if vehicle.state == VehicleStateEnum.IDLE and vehicle.destination_node_id != vehicle.current_node_id:
                print(f"Vehicle {vehicle.id} is IDLE at {vehicle.current_node_id}, attempting to assign new route to {vehicle.destination_node_id}.")
                routing_service.assign_route_to_vehicle(vehicle, VEHICLES_DB)


        # Ensure the loop runs roughly every SIMULATION_STEP_INTERVAL_SECONDS
        # Adjust sleep time based on how long the current iteration took
        # processing_time = time.monotonic() - current_real_time
        # sleep_duration = max(0, SIMULATION_STEP_INTERVAL_SECONDS - processing_time)
        # await asyncio.sleep(sleep_duration)
        await asyncio.sleep(SIMULATION_STEP_INTERVAL_SECONDS) # Simpler fixed sleep

    print("Simulation loop stopped.")

async def update_vehicle_positions(time_delta_simulated: float):
    """
    Updates positions of all vehicles based on elapsed simulated time.
    """
    for vehicle_id, vehicle in list(VEHICLES_DB.items()): # Iterate over a copy for safe modification
        if vehicle.state != VehicleStateEnum.ON_ROUTE or not vehicle.current_path:
            continue

        # Vehicle is on a route
        vehicle.time_on_current_segment += time_delta_simulated

        # Determine current road segment
        if vehicle.current_path_index < len(vehicle.current_path) -1:
            source_node = vehicle.current_path[vehicle.current_path_index]
            target_node = vehicle.current_path[vehicle.current_path_index + 1]
            current_road_key = (source_node, target_node)
            
            # If this is the first time processing this segment for the vehicle
            if vehicle.current_road_segment != current_road_key:
                if vehicle.current_road_segment: # Leaving an old road segment
                    graph_manager.update_road_vehicle_count(vehicle.current_road_segment, -1)
                
                vehicle.current_road_segment = current_road_key
                graph_manager.update_road_vehicle_count(vehicle.current_road_segment, +1)
                vehicle.current_node_id = source_node # Vehicle is now on this road, originating from source_node
                # print(f"Vehicle {vehicle.id} entered road {source_node}->{target_node}")

            # Get travel time for this segment from the graph (it's dynamic)
            try:
                # graph_manager.CITY_GRAPH might not be updated immediately by update_road_vehicle_count
                # due to how updates propagate. Safer to get it directly.
                # travel_time_for_segment = graph_manager.CITY_GRAPH.edges[current_road_key]['current_travel_time']
                
                # Let's ensure we use the freshest data from ROAD_DATA which is updated by update_road_vehicle_count
                if current_road_key in graph_manager.ROAD_DATA:
                    base_time = graph_manager.ROAD_DATA[current_road_key]["base_travel_time"]
                    congestion = graph_manager.ROAD_DATA[current_road_key]["current_congestion"]
                    if congestion < 0.99:
                        penalty_factor = 1 / (1 - congestion * 0.9)
                    else:
                        penalty_factor = 20
                    travel_time_for_segment = base_time * penalty_factor
                else: # Should not happen if pathing is correct
                    print(f"Warning: Road data for {current_road_key} not found for vehicle {vehicle.id}. Using default time.")
                    travel_time_for_segment = 1000 # Some large default

            except KeyError:
                print(f"Error: Edge {current_road_key} not found in graph for vehicle {vehicle.id}. Path: {vehicle.current_path}")
                # This is a critical error, vehicle might get stuck. For now, make it take very long.
                travel_time_for_segment = float('inf')


            if vehicle.time_on_current_segment >= travel_time_for_segment:
                # Vehicle has completed this segment
                # print(f"Vehicle {vehicle.id} completed road {source_node}->{target_node} in {vehicle.time_on_current_segment:.2f}s (expected {travel_time_for_segment:.2f}s)")
                
                # Update vehicle state
                vehicle.current_path_index += 1
                vehicle.current_node_id = target_node # Arrived at the target_node of the segment
                vehicle.time_on_current_segment = 0.0 # Reset for next segment
                
                # Remove from the completed road segment
                graph_manager.update_road_vehicle_count(current_road_key, -1)
                vehicle.current_road_segment = None # No longer on this specific segment

                if vehicle.current_path_index >= len(vehicle.current_path) - 1:
                    # Reached destination or end of current path segment list
                    vehicle.state = VehicleStateEnum.ARRIVED
                    vehicle.current_node_id = vehicle.destination_node_id # Ensure it's at final dest
                    print(f"Vehicle {vehicle.id} arrived at destination {vehicle.destination_node_id}.")
                else:
                    # Still on route, will pick up next segment in next iteration
                    # Vehicle is now at an intersection (target_node), ready for next segment
                    # The next iteration will handle moving it to the next road
                    vehicle.state = VehicleStateEnum.ON_ROUTE # Or IDLE if it needs to wait at intersection
                    pass
        else: # Should have been caught by ARRIVED state check
            vehicle.state = VehicleStateEnum.ARRIVED
            if vehicle.current_road_segment: # ensure it's removed from last road
                 graph_manager.update_road_vehicle_count(vehicle.current_road_segment, -1)
                 vehicle.current_road_segment = None

        VEHICLES_DB[vehicle_id] = vehicle # Update the vehicle in the main DB

def start_simulation_task():
    global simulation_task, _stop_simulation
    if simulation_task is None or simulation_task.done():
        _stop_simulation = False
        simulation_task = asyncio.create_task(simulation_loop())
        print("Simulation task created and started.")
    else:
        print("Simulation task already running.")

def stop_simulation_task():
    global _stop_simulation
    _stop_simulation = True
    if simulation_task:
        print("Stop signal sent to simulation task.")
    else:
        print("No simulation task to stop.")

def get_simulation_time():
    return SIMULATION_TIME