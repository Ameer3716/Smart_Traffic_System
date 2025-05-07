// frontend/src/components/ControlPanel.jsx
import React, { useState, useEffect } from 'react';
import { 
    updateTrafficAPI, 
    addVehicleAPI as addVehicleServiceAPI, // This should now work
    rerouteVehicleAPI 
} from '../services/api'; 
import basicMapData from '../../../backend/data/map_basic.json'; // Corrected path

const mapPresets = { "basic": basicMapData }; // Add other presets if you have their JSON files in frontend/src/data

const ControlPanel = ({ nodes = [], edges = [], vehicles = [], onSystemUpdate, setError, onMapLoad }) => {
    const [roadToCongest, setRoadToCongest] = useState('');
    const [congestionLevel, setCongestionLevel] = useState(0.5);
    const [vehicleCountCongestion, setVehicleCountCongestion] = useState(10);

    const [newVehicleId, setNewVehicleId] = useState('');
    const [newVehicleStartNode, setNewVehicleStartNode] = useState('');
    const [newVehicleEndNode, setNewVehicleEndNode] = useState('');     
    
    const [rerouteVehicleId, setRerouteVehicleId] = useState('');
    const [rerouteNewStartNode, setRerouteNewStartNode] = useState('');

    const [selectedMapKey, setSelectedMapKey] = useState('basic');

    useEffect(() => {
        if (nodes.length > 0) {
            if (!newVehicleStartNode) setNewVehicleStartNode(nodes[0].id);
            if (!newVehicleEndNode && nodes.length > 1) setNewVehicleEndNode(nodes[1].id);
            else if (!newVehicleEndNode && nodes.length === 1) setNewVehicleEndNode(nodes[0].id); // Handle single node case

            // For rerouteNewStartNode, it's optional, so don't auto-fill unless necessary
            // or provide a "current location" default. If it's empty, backend uses vehicle's current.
            if (!rerouteNewStartNode && nodes.length > 0 && !vehicles.find(v => v.id === rerouteVehicleId) ) { 
                // Only set if no vehicle selected or vehicle not found, to avoid overwriting user choice for a valid vehicle
                 setRerouteNewStartNode(nodes[0].id);
            }

        } else {
            setNewVehicleStartNode(''); setNewVehicleEndNode('');
            setRerouteNewStartNode('');
        }
    }, [nodes, rerouteVehicleId, vehicles]); 

    useEffect(() => {
        if (edges.length > 0 && !roadToCongest) {
            const firstEdge = edges[0];
            setRoadToCongest(`${firstEdge.source}-${firstEdge.target}`);
        } else if (edges.length === 0) {
            setRoadToCongest('');
        }
    }, [edges]);

    useEffect(() => {
        if(vehicles.length > 0 && !rerouteVehicleId){
            setRerouteVehicleId(vehicles[0].id);
        } else if (vehicles.length === 0) {
            setRerouteVehicleId('');
        }
    }, [vehicles]);

    const handleUpdateTraffic = async (e) => {
        e.preventDefault();
        if (!roadToCongest) { setError("Select a road to update traffic."); return; }
        try {
            await updateTrafficAPI([{ 
                road_id: roadToCongest, 
                congestion_level: parseFloat(congestionLevel),
                vehicle_count: parseInt(vehicleCountCongestion)
            }]);
            onSystemUpdate(); setError('');
        } catch (err) { setError(err.response?.data?.detail || "Failed to update traffic."); }
    };
    
    const handleAddVehicle = async (e) => {
        e.preventDefault();
        if (!newVehicleStartNode || !newVehicleEndNode) {
            setError("Select start and end nodes for the new vehicle."); return;
        }
        try {
            await addVehicleServiceAPI({ // Using the aliased import
                vehicle_id: newVehicleId || null, 
                start_node_id: newVehicleStartNode,
                end_node_id: newVehicleEndNode
            });
            onSystemUpdate(); setError('');
            setNewVehicleId(''); 
        } catch (err) { setError(err.response?.data?.detail || "Failed to add vehicle."); }
    };

    const handleRerouteVehicle = async (e) => {
        e.preventDefault();
        if (!rerouteVehicleId) { setError("Select a vehicle to reroute."); return; }
        try {
            await rerouteVehicleAPI(rerouteVehicleId, rerouteNewStartNode || undefined ); // Pass undefined if empty for cleaner API call
            onSystemUpdate(); setError('');
            setRerouteNewStartNode(''); // Clear after reroute attempt
        } catch (err) { setError(err.response?.data?.detail || "Failed to reroute vehicle."); }
    };

    const handleMapSelectionChange = (e) => { 
        const mapKey = e.target.value; setSelectedMapKey(mapKey);
        if (mapPresets[mapKey] && onMapLoad) {
            onMapLoad(mapPresets[mapKey]);
        } else {
            setError(`Map preset "${mapKey}" not found. Ensure its JSON is in frontend/src/data and added to mapPresets.`);
        }
    };

    return (
        <div className="space-y-3 text-sm">
            <div className="p-2 border rounded-lg bg-white">
                <h3 className="text-[0.9rem] font-semibold mb-1">Load Map</h3>
                <select value={selectedMapKey} onChange={handleMapSelectionChange} className="mt-1 block w-full p-1.5 border text-xs rounded-md shadow-sm">
                    {Object.keys(mapPresets).map(key => (<option key={key} value={key}>{key.charAt(0).toUpperCase() + key.slice(1)} Map</option>))}
                </select>
            </div>

            <form onSubmit={handleAddVehicle} className="p-2 border rounded-lg bg-white">
                <h3 className="text-[0.9rem] font-semibold mb-1">Add Vehicle</h3>
                <div className="mb-1.5">
                    <label htmlFor="newVehicleId" className="block text-xs font-medium text-gray-700">Vehicle ID (optional):</label>
                    <input type="text" id="newVehicleId" value={newVehicleId} onChange={e => setNewVehicleId(e.target.value)} placeholder="auto-gen if empty" className="mt-0.5 block w-full p-1 border border-gray-300 rounded-md shadow-sm text-xs"/>
                </div>
                 <div className="mb-1.5">
                    <label htmlFor="newVehicleStartNode" className="block text-xs font-medium text-gray-700">Start Node:</label>
                    <select id="newVehicleStartNode" value={newVehicleStartNode} onChange={e => setNewVehicleStartNode(e.target.value)} className="mt-0.5 block w-full p-1 border border-gray-300 rounded-md shadow-sm text-xs" required>
                        <option value="">Select Start</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
                    </select>
                </div>
                <div className="mb-1.5">
                    <label htmlFor="newVehicleEndNode" className="block text-xs font-medium text-gray-700">Destination Node:</label>
                    <select id="newVehicleEndNode" value={newVehicleEndNode} onChange={e => setNewVehicleEndNode(e.target.value)} className="mt-0.5 block w-full p-1 border border-gray-300 rounded-md shadow-sm text-xs" required>
                        <option value="">Select Destination</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
                    </select>
                </div>
                <button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-1.5 px-2.5 rounded text-xs">Add Vehicle</button>
            </form>

            <form onSubmit={handleUpdateTraffic} className="p-2 border rounded-lg bg-white">
                <h3 className="text-[0.9rem] font-semibold mb-1">Simulate Traffic (Manual)</h3>
                 <div className="mb-1.5">
                    <label htmlFor="roadToCongest" className="block text-xs font-medium text-gray-700">Road:</label>
                    <select id="roadToCongest" value={roadToCongest} onChange={e => setRoadToCongest(e.target.value)} className="mt-0.5 block w-full p-1 border border-gray-300 rounded-md shadow-sm text-xs">
                        <option value="">Select Road</option>
                        {edges.map(edge => <option key={`${edge.source}-${edge.target}`} value={`${edge.source}-${edge.target}`}>{edge.source}→{edge.target}</option>)}
                    </select>
                </div>
                <div className="mb-1.5">
                    <label htmlFor="congestionLevel" className="block text-xs font-medium text-gray-700">Congestion Level (0-1):</label>
                    <input type="number" id="congestionLevel" step="0.05" min="0" max="1" value={congestionLevel} onChange={e => setCongestionLevel(parseFloat(e.target.value))} className="mt-0.5 block w-full p-1 border border-gray-300 rounded-md shadow-sm text-xs"/>
                </div>
                <div className="mb-1.5">
                    <label htmlFor="vehicleCountCongestion" className="block text-xs font-medium text-gray-700">Vehicle Count (on road):</label>
                    <input type="number" id="vehicleCountCongestion" step="1" min="0" value={vehicleCountCongestion} onChange={e => setVehicleCountCongestion(parseInt(e.target.value))} className="mt-0.5 block w-full p-1 border border-gray-300 rounded-md shadow-sm text-xs"/>
                </div>
                <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-1.5 px-2.5 rounded text-xs">Update Traffic</button>
            </form>

            <form onSubmit={handleRerouteVehicle} className="p-2 border rounded-lg bg-white">
                <h3 className="text-[0.9rem] font-semibold mb-1">Reroute Vehicle</h3>
                 <div className="mb-1.5">
                    <label htmlFor="rerouteVehicleId" className="block text-xs font-medium text-gray-700">Vehicle ID:</label>
                    <select id="rerouteVehicleId" value={rerouteVehicleId} onChange={e => setRerouteVehicleId(e.target.value)} className="mt-0.5 block w-full p-1 border border-gray-300 rounded-md shadow-sm text-xs" required>
                        <option value="">Select Vehicle</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.id}</option>)}
                    </select>
                </div>
                 <div className="mb-1.5">
                    <label htmlFor="rerouteNewStartNode" className="block text-xs font-medium text-gray-700">New Start Node (optional):</label>
                    <select id="rerouteNewStartNode" value={rerouteNewStartNode} onChange={e => setRerouteNewStartNode(e.target.value)} className="mt-0.5 block w-full p-1 border border-gray-300 rounded-md shadow-sm text-xs">
                        <option value="">Vehicle's Current Location</option>
                        {nodes.map(n => <option key={n.id} value={n.id}>{n.name || n.id}</option>)}
                    </select>
                </div>
                <button type="submit" className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-1.5 px-2.5 rounded text-xs">Reroute</button>
            </form>
        </div>
    );
};
export default ControlPanel;