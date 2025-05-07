import axios from 'axios';

const API_URL = 'http://localhost:8000'; // Your backend URL

export const loadMapAPI = async (mapData) => {
    return axios.post(`${API_URL}/map/load`, mapData);
};

export const updateTrafficAPI = async (trafficUpdates) => {
    return axios.put(`${API_URL}/traffic/update`, trafficUpdates);
};

export const requestRouteAPI = async (startNodeId, endNodeId, vehicleId = null) => {
    return axios.post(`${API_URL}/routes/request`, {
        start_node_id: startNodeId,
        end_node_id: endNodeId,
        vehicle_id: vehicleId
    });
};

export const rerouteVehicleAPI = async (vehicleId, currentNodeId) => {
    return axios.post(`${API_URL}/routes/reroute/${vehicleId}`, { current_node_id: currentNodeId });
};

export const getTrafficLightsAPI = async () => {
    return axios.get(`${API_URL}/traffic-lights`);
};

export const getIntersectionLightAPI = async (intersectionId) => {
    return axios.get(`${API_URL}/traffic-lights/${intersectionId}`);
};

export const getSystemStateAPI = async () => {
    return axios.get(`${API_URL}/system/state`);
};

export const addVehicleAPI = async (vehicleData) => {
    return axios.post(`${API_URL}/vehicles`, vehicleData);
};

export const getAllVehiclesAPI = async () => {
    return axios.get(`${API_URL}/vehicles`);
};

export const getRoadConditionsAPI = async () => {
    return axios.get(`${API_URL}/map/roads/conditions`);
};