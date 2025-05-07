// frontend/src/services/api.js (or .ts)
import axios from 'axios';

const API_URL = 'http://localhost:8000'; // Your backend URL

export const loadMapAPI = async (mapData) => {
    return axios.post(`${API_URL}/map/load`, mapData);
};

export const updateTrafficAPI = async (trafficUpdates) => {
    return axios.put(`${API_URL}/traffic/update`, trafficUpdates);
};

// This was the original function for requesting a generic route.
// The backend /routes/request endpoint still exists, but adding vehicles is now preferred via /vehicles.
export const requestRouteAPI = async (startNodeId, endNodeId, vehicleId = null) => {
    return axios.post(`${API_URL}/routes/request`, {
        start_node_id: startNodeId,
        end_node_id: endNodeId,
        vehicle_id: vehicleId
    });
};

// This is the function that ControlPanel.jsx is trying to import as `addVehicleAPI`
// Ensure its name matches what you're trying to import.
// The backend endpoint for adding a vehicle is POST /vehicles
// and it expects a body like { vehicle_id (optional), start_node_id, end_node_id }
export const addVehicleAPI = async (vehicleData) => { // Ensure this function exists and is exported
    // vehicleData should be: { vehicle_id?, start_node_id, end_node_id }
    return axios.post(`${API_URL}/vehicles`, vehicleData);
};

export const rerouteVehicleAPI = async (vehicleId, newStartNodeId = null) => {
    // The backend endpoint for rerouting is /vehicles/{vehicle_id}/reroute
    // and it expects `new_start_node_id` in the body, optionally.
    const body = {};
    if (newStartNodeId) {
        body.new_start_node_id = newStartNodeId;
    }
    return axios.post(`${API_URL}/vehicles/${vehicleId}/reroute`, body);
};

export const getTrafficLightsAPI = async () => {
    return axios.get(`${API_URL}/traffic-lights`);
};

export const getSystemStateAPI = async () => {
    return axios.get(`${API_URL}/system/state`);
};

export const getAllVehiclesAPI = async () => { // This is still useful
    return axios.get(`${API_URL}/vehicles`);
};

export const getRoadConditionsAPI = async () => {
    return axios.get(`${API_URL}/map/roads/conditions`);
};