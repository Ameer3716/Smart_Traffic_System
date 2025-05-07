import React, { useState, useEffect, useCallback } from 'react';
import MapDisplay from './components/MapDisplay';
import ControlPanel from './components/ControlPanel';
import { 
    loadMapAPI, 
    getSystemStateAPI, 
    getRoadConditionsAPI,
    getAllVehiclesAPI // Added for vehicle list
} from './services/api';
import basicMapData from '../../backend/data/map_basic.json'; // Make sure this path is correct

function App() {
  const [mapData, setMapData] = useState(null); // This will store the raw map JSON
  const [currentNodes, setCurrentNodes] = useState([]); // For passing to components
  const [currentEdges, setCurrentEdges] = useState([]); // For passing to components

  const [routes, setRoutes] = useState([]);
  const [trafficLights, setTrafficLights] = useState([]);
  const [roadConditions, setRoadConditions] = useState({});
  const [vehicles, setVehicles] = useState([]); 
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSystemUpdating, setIsSystemUpdating] = useState(false);


  const fetchSystemState = useCallback(async () => {
    if (!mapData) return; // Don't fetch if map isn't loaded
    setIsSystemUpdating(true);
    try {
      const [systemStateRes, roadConditionsRes, vehiclesRes] = await Promise.all([
        getSystemStateAPI(),
        getRoadConditionsAPI(),
        getAllVehiclesAPI() // Fetch all vehicles
      ]);

      setRoutes(systemStateRes.data.routes);
      setTrafficLights(systemStateRes.data.traffic_lights);
      setRoadConditions(roadConditionsRes.data);
      setVehicles(vehiclesRes.data); // Update vehicles state
      setError('');
    } catch (err) {
      console.error("Failed to fetch system state:", err);
      const errorMsg = err.response?.data?.detail || 'Failed to fetch system state. Is the backend running?';
      setError(errorMsg);
    } finally {
      setIsSystemUpdating(false);
    }
  }, [mapData]);


  const initializeMap = useCallback(async (mapToLoad) => {
    try {
      setIsLoading(true);
      setError('');
      await loadMapAPI(mapToLoad);
      setMapData(mapToLoad); 
      setCurrentNodes(mapToLoad.nodes);
      setCurrentEdges(mapToLoad.edges);
      console.log("Map loaded successfully via API:", mapToLoad.nodes.length, "nodes");
      // After map is loaded successfully, then fetch system state
      // Use a slight delay or ensure backend is ready before first fetchSystemState
      setTimeout(fetchSystemState, 500); 
    } catch (err) {
      console.error("Failed to load map:", err);
      const errorMsg = err.response?.data?.detail || 'Failed to load map. Ensure backend is running and map data is correct.';
      setError(errorMsg);
      setMapData(null); // Clear map data on error
      setCurrentNodes([]);
      setCurrentEdges([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchSystemState]);

  useEffect(() => {
    // Load basic map on initial component mount
    initializeMap(basicMapData); 
  }, [initializeMap]); // initializeMap is stable due to useCallback

  // Periodically refresh state
  useEffect(() => {
    if (!mapData || isLoading) return; // Don't poll if map isn't loaded or initial load in progress
    const intervalId = setInterval(fetchSystemState, 5000); // Refresh every 5 seconds
    return () => clearInterval(intervalId);
  }, [fetchSystemState, mapData, isLoading]);


  return (
    <div className="container mx-auto p-4 font-sans">
      <header className="mb-6">
        <h1 className="text-4xl font-bold text-center text-blue-600">Smart Traffic Management System</h1>
      </header>
      
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}
      {(isLoading || isSystemUpdating) && <div className="text-center p-4 text-blue-500">{isLoading ? "Initializing Map..." : "Updating System Data..."}</div>}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gray-50 p-1 rounded-lg shadow"> {/* Reduced padding for map container */}
          <h2 className="text-2xl font-semibold mb-1 p-3 text-gray-700">City Map & Routes</h2>
          {currentNodes.length > 0 ? (
            <MapDisplay
              nodes={currentNodes}
              edges={currentEdges}
              routes={routes}
              roadConditions={roadConditions}
              svgWidth={700} // Example width
              svgHeight={500} // Example height
            />
          ) : !isLoading && ( // Only show "Loading map data..." if not actively loading and no nodes
            <p className="text-center p-10 text-gray-500">Loading map data or map not loaded...</p>
          )}
        </div>

        <div className="md:col-span-1 bg-gray-50 p-4 rounded-lg shadow">
          <ControlPanel
            nodes={currentNodes}
            edges={currentEdges}
            vehicles={vehicles} // Pass vehicles to ControlPanel for selection
            onSystemUpdate={fetchSystemState}
            setError={setError}
            onMapLoad={initializeMap} // Allow ControlPanel to trigger map loads
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-2xl font-semibold mb-3 text-gray-700">Traffic Light Status</h2>
          {trafficLights.length > 0 ? (
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {trafficLights.map(light => (
                <li key={light.intersection_id} className="p-2 border rounded">
                  <strong>Intersection {light.intersection_id}:</strong>
                  <ul className="list-disc list-inside ml-4 text-sm">
                    {Object.entries(light.green_times).map(([road, time]) => (
                      <li key={road}>{road}: <span className="font-semibold text-green-600">{time}s green</span></li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p>No traffic light data available.</p>
          )}
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-2xl font-semibold mb-3 text-gray-700">Tracked Vehicles</h2>
            {vehicles.length > 0 ? (
                <ul className="space-y-2 max-h-60 overflow-y-auto">
                    {vehicles.map(v => (
                        <li key={v.id} className="p-2 border rounded text-sm">
                            <strong>ID: {v.id}</strong>
                            <div>From: {v.current_node_id} → To: {v.destination_node_id}</div>
                            {v.current_path && <div>Path: {v.current_path.join(' → ')} (Cost: {v.path_cost?.toFixed(1)})</div>}
                        </li>
                    ))}
                </ul>
            ) : <p>No vehicles being tracked.</p>}
        </div>
      </div>
       
       <div className="mt-6 bg-white p-4 rounded-lg shadow">
          <h2 className="text-2xl font-semibold mb-3 text-gray-700">Current Road Conditions</h2>
          {Object.keys(roadConditions).length > 0 ? (
            <div className="overflow-x-auto max-h-80">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Road ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Congestion</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicles</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Travel Time (s)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(roadConditions).map(([roadId, data]) => (
                    <tr key={roadId}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{roadId}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div 
                                className={`h-2.5 rounded-full ${data.current_congestion > 0.7 ? 'bg-red-500' : data.current_congestion > 0.4 ? 'bg-yellow-400' : 'bg-green-500'}`} 
                                style={{ width: `${data.current_congestion * 100}%`}}
                            ></div>
                        </div>
                        <span className="ml-1">{(data.current_congestion * 100).toFixed(0)}%</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.current_vehicles}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{data.current_travel_time.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No road condition data available.</p>
          )}
        </div>
    </div>
  );
}

export default App;