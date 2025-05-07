import React, { useState, useEffect } from 'react';
import { requestRouteAPI, updateTrafficAPI, addVehicleAPI, rerouteVehicleAPI } from '../services/api';
// Sample maps for selection (optional)
import basicMapData from '../../../backend/data/map_basic.json'; 
// You would create these files if you want to test with them
// import mediumMapData from '../data/medium_map.json'; 
// import complexMapData from '../data/complex_map.json';

const mapPresets = {
    "basic": basicMapData,
    // "medium": mediumMapData,
    // "complex": complexMapData,
};

const ControlPanel = ({ nodes = [], edges = [], vehicles = [], onSystemUpdate, setError, onMapLoad }) => {
    const [startNode, setStartNode] = useState('');
    const [endNode, setEndNode] = useState('');
    const [vehicleIdRoute, setVehicleIdRoute] = useState('');

    const [roadToCongest, setRoadToCongest] = useState('');
    const [congestionLevel, setCongestionLevel] = useState(0.5);
    const [vehicleCount, setVehicleCount] = useState(10); // Default vehicle count for simulation

    const [newVehicleId, setNewVehicleId] = useState('');
    const [newVehicleStart, setNewVehicleStart] = useState('');
    const [newVehicleEnd, setNewVehicleEnd] = useState('');
    
    const [rerouteVehicleId, setRerouteVehicleId] = useState('');
    const [rerouteCurrentNode, setRerouteCurrentNode] = useState('');

    const [selectedMapKey, setSelectedMapKey] = useState('basic');

    // Pre-fill route request form if a vehicle is selected for rerouting
    useEffect(() => {
        if (rerouteVehicleId) {
            const vehicle = vehicles.find(v => v.id === rerouteVehicleId);
            if (vehicle) {
                // setRerouteCurrentNode(vehicle.current_node_id); // Or let user pick
            }
        }
    }, [rerouteVehicleId, vehicles]);

    // Auto-select first available node/edge if lists are populated
    useEffect(() => {
        if (nodes.length > 0) {
            if (!startNode) setStartNode(nodes[0].id);
            if (!endNode && nodes.length > 1) setEndNode(nodes[1].id);
            else if (!endNode && nodes.length === 1) setEndNode(nodes[0].id);
            if (!newVehicleStart) setNewVehicleStart(nodes[0].id);
            if (!newVehicleEnd && nodes.length > 1) setNewVehicleEnd(nodes[1].id);
            else if(!newVehicleEnd && nodes.length ===1) setNewVehicleEnd(nodes[0].id);
             if (!rerouteCurrentNode) setRerouteCurrentNode(nodes[0].id);
        }
    }, [nodes, startNode, endNode, newVehicleStart, newVehicleEnd, rerouteCurrentNode]);

    useEffect(() => {
        if (edges.length > 0 && !roadToCongest) {
            setRoadToCongest(`${edges[0].source}-${edges[0].target}`);
        }
    }, [edges, roadToCongest]);
    
    useEffect(() => {
        if(vehicles.length > 0 && !rerouteVehicleId){
            setRerouteVehicleId(vehicles[0].id);
        }
    }, [vehicles, rerouteVehicleId])


    const handleRequestRoute = async (e) => {
        e.preventDefault();
        if (!startNode || !endNode) {
            setError("Please select start and end nodes for routing.");
            return;
        }
        try {
            const vId = vehicleIdRoute || `anon_veh_${Date.now().toString().slice(-4)}`;
            await requestRouteAPI(startNode, endNode, vId);
            onSystemUpdate(); 
            setError('');
            setVehicleIdRoute(''); // Clear after request
        } catch (err) {
            console.error("Route request failed:", err);
            setError(err.response?.data?.detail || "Failed to request route.");
        }
    };

    const handleUpdateTraffic = async (e) => {
        e.preventDefault();
        if (!roadToCongest) {
            setError("Please select a road to update traffic.");
            return;
        }
        try {
            await updateTrafficAPI([{ 
                road_id: roadToCongest, 
                congestion_level: parseFloat(congestionLevel),
                vehicle_count: parseInt(vehicleCount)
            }]);
            onSystemUpdate();
            setError('');
        } catch (err) {
            console.error("Traffic update failed:", err);
            setError(err.response?.data?.detail || "Failed to update traffic.");
        }
    };
    
    const handleAddVehicle = async (e) => {
        e.preventDefault();
        if (!newVehicleId || !newVehicleStart || !newVehicleEnd) {
            setError("Please provide ID, start, and end for the new vehicle.");
            return;
        }
        try {
            await addVehicleAPI({
                id: newVehicleId,
                current_node_id: newVehicleStart,
                destination_node_id: newVehicleEnd
            });
            onSystemUpdate();
            setError('');
            setNewVehicleId(''); // Clear after adding
            // setNewVehicleStart(''); setNewVehicleEnd(''); // Keep start/end for easier multi-add
        } catch (err) {
            console.error("Add vehicle failed:", err);
            setError(err.response?.data?.detail || "Failed to add vehicle.");
        }
    };

    const handleRerouteVehicle = async (e) => {
        e.preventDefault();
        if (!rerouteVehicleId || !rerouteCurrentNode) {
            setError("Please provide Vehicle ID and its current node for rerouting.");
            return;
        }
        try {
            await rerouteVehicleAPI(rerouteVehicleId, rerouteCurrentNode);
            onSystemUpdate();
            setError('');
        } catch (err) {
            console.error("Reroute failed:", err);
            setError(err.response?.data?.detail || "Failed to reroute vehicle.");
        }
    };

    const handleMapSelectionChange = (e) => {
        const mapKey = e.target.value;
        setSelectedMapKey(mapKey);
        if (mapPresets[mapKey] && onMapLoad) {
            onMapLoad(mapPresets[mapKey]); // Trigger map load in App.jsx
        } else {
            setError(`Map preset "${mapKey}" not found.`);
        }
    };

    return (
        <div className="space-y-4 text-sm">
            {/* Map Selection */}
            <div className="p-3 border rounded-lg bg-white">
                <h3 className="text-md font-semibold mb-2">Load Map</h3>
                <select value={selectedMapKey} onChange={handleMapSelectionChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                    {Object.keys(mapPresets).map(key => (
                        <option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)} Map</option>
                    ))}
                </select>
            </div>

            {/* Route Request Form */}
            <form onSubmit={handleRequestRoute} className="p-3 border rounded-lg bg-white">
                <h3 className="text-md font-semibold mb-2">Request Route</h3>
                <div className="mb-2">
                    <label htmlFor="vehicleIdRoute" className="block text-xs font-medium">Vehicle ID (optional):</label>
                    <input type="text" id="vehicleIdRoute" value={vehicleIdRoute} onChange={e => setVehicleIdRoute(e.target.value)} placeholder="e.g., car123" className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs"/>
                </div>
                <div className="mb-2">
                    <label htmlFor="startNode" className="block text-xs font-medium">Start Node:</label>
                    <select id="startNode" value={startNode} onChange={e => setStartNode(e.target.value)} className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs">
                        <option value="">Select Start</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
                    </select>
                </div>
                <div className="mb-2">
                    <label htmlFor="endNode" className="block text-xs font-medium">End Node:</label>
                    <select id="endNode" value={endNode} onChange={e => setEndNode(e.target.value)} className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs">
                        <option value="">Select End</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
                    </select>
                </div>
                <button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-1.5 px-3 rounded text-xs">Get Route</button>
            </form>

            {/* Traffic Update Form */}
            <form onSubmit={handleUpdateTraffic} className="p-3 border rounded-lg bg-white">
                <h3 className="text-md font-semibold mb-2">Simulate Traffic</h3>
                 <div className="mb-2">
                    <label htmlFor="roadToCongest" className="block text-xs font-medium">Road (Source-Target):</label>
                    <select id="roadToCongest" value={roadToCongest} onChange={e => setRoadToCongest(e.target.value)} className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs">
                        <option value="">Select Road</option>
                        {edges.map(edge => <option key={`${edge.source}-${edge.target}`} value={`${edge.source}-${edge.target}`}>{edge.source} → {edge.target}</option>)}
                    </select>
                </div>
                <div className="mb-2">
                    <label htmlFor="congestionLevel" className="block text-xs font-medium">Congestion Level (0.0 - 1.0):</label>
                    <input type="number" id="congestionLevel" step="0.05" min="0" max="1" value={congestionLevel} onChange={e => setCongestionLevel(parseFloat(e.target.value))} className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs"/>
                </div>
                <div className="mb-2">
                    <label htmlFor="vehicleCount" className="block text-xs font-medium">Vehicle Count (on this road):</label>
                    <input type="number" id="vehicleCount" step="1" min="0" value={vehicleCount} onChange={e => setVehicleCount(parseInt(e.target.value))} className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs"/>
                </div>
                <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-1.5 px-3 rounded text-xs">Update Traffic</button>
            </form>

            {/* Add Vehicle Form */}
            <form onSubmit={handleAddVehicle} className="p-3 border rounded-lg bg-white">
                <h3 className="text-md font-semibold mb-2">Add New Vehicle</h3>
                <div className="mb-2">
                    <label htmlFor="newVehicleId" className="block text-xs font-medium">Vehicle ID:</label>
                    <input type="text" id="newVehicleId" value={newVehicleId} onChange={e => setNewVehicleId(e.target.value)} placeholder="Unique ID, e.g., V789" className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs" required/>
                </div>
                 <div className="mb-2">
                    <label htmlFor="newVehicleStart" className="block text-xs font-medium">Start Node:</label>
                    <select id="newVehicleStart" value={newVehicleStart} onChange={e => setNewVehicleStart(e.target.value)} className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs" required>
                        <option value="">Select Start</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
                    </select>
                </div>
                <div className="mb-2">
                    <label htmlFor="newVehicleEnd" className="block text-xs font-medium">Destination Node:</label>
                    <select id="newVehicleEnd" value={newVehicleEnd} onChange={e => setNewVehicleEnd(e.target.value)} className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs" required>
                        <option value="">Select Destination</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
                    </select>
                </div>
                <button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-1.5 px-3 rounded text-xs">Add Vehicle</button>
            </form>

            {/* Reroute Vehicle Form */}
            <form onSubmit={handleRerouteVehicle} className="p-3 border rounded-lg bg-white">
                <h3 className="text-md font-semibold mb-2">Reroute Vehicle</h3>
                 <div className="mb-2">
                    <label htmlFor="rerouteVehicleId" className="block text-xs font-medium">Vehicle ID to Reroute:</label>
                    <select id="rerouteVehicleId" value={rerouteVehicleId} onChange={e => setRerouteVehicleId(e.target.value)} className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs" required>
                        <option value="">Select Vehicle</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.id}</option>)}
                    </select>
                </div>
                 <div className="mb-2">
                    <label htmlFor="rerouteCurrentNode" className="block text-xs font-medium">Vehicle's New Current Node:</label>
                    <select id="rerouteCurrentNode" value={rerouteCurrentNode} onChange={e => setRerouteCurrentNode(e.target.value)} className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm text-xs" required>
                        <option value="">Select Current Node</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
                    </select>
                </div>
                <button type="submit" className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-1.5 px-3 rounded text-xs">Reroute Vehicle</button>
            </form>
        </div>
    );
};
export default ControlPanel;