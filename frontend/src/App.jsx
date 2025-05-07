// frontend/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import MapDisplay from './components/MapDisplay';
import ControlPanel from './components/ControlPanel';
import { 
    loadMapAPI, 
    getSystemStateAPI,
    getRoadConditionsAPI // Make sure this is imported from services/api.js
} from './services/api';
import basicMapData from '../../backend/data/map_basic.json';

const POLLING_INTERVAL_MS = 3000;

function App() {
  const [mapData, setMapData] = useState(null);
  const [currentNodes, setCurrentNodes] = useState([]);
  const [currentEdges, setCurrentEdges] = useState([]);

  const [trafficLights, setTrafficLights] = useState([]);
  const [roadConditions, setRoadConditions] = useState({}); // Initialize as empty object
  const [vehicles, setVehicles] = useState([]); 
  const [simulationTime, setSimulationTime] = useState(0);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSystemUpdating, setIsSystemUpdating] = useState(false);


  const fetchSystemState = useCallback(async () => {
    if (!mapData) return;
    setIsSystemUpdating(true);
    // console.log("App.jsx: Fetching system state...");
    try {
      // Fetch system state and road conditions in parallel for efficiency
      const [systemStateRes, roadConditionsRes] = await Promise.all([
        getSystemStateAPI(),
        getRoadConditionsAPI() // Use the dedicated API function
      ]);

      if (systemStateRes && systemStateRes.data) {
        setTrafficLights(systemStateRes.data.traffic_lights || []);
        setVehicles(systemStateRes.data.vehicles || []);
        setSimulationTime(systemStateRes.data.simulation_time || 0);
      } else {
        console.warn("App.jsx: System state response was not as expected.", systemStateRes);
      }

      if (roadConditionsRes && roadConditionsRes.data) {
        // console.log("App.jsx: Fetched Road Conditions:", roadConditionsRes.data);
        setRoadConditions(roadConditionsRes.data);
      } else {
        console.warn("App.jsx: Road conditions response was not as expected.", roadConditionsRes);
        setRoadConditions({}); // Reset or keep old if fetch fails partially
      }
      
      setError('');
    } catch (err) {
      console.error("App.jsx: Failed to fetch system state or road conditions:", err);
      const errorMsg = err.response?.data?.detail || 'Failed to fetch system state.';
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
      // console.log("App.jsx: Map loaded. Nodes:", mapToLoad.nodes.length);
      setTimeout(() => {
        if (mapToLoad) fetchSystemState();
      }, 200); 
    } catch (err) {
      console.error("App.jsx: Failed to load map:", err);
      setError(err.response?.data?.detail || 'Failed to load map.');
      setMapData(null); setCurrentNodes([]); setCurrentEdges([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchSystemState]);

  useEffect(() => {
    initializeMap(basicMapData);
  }, [initializeMap]);

  useEffect(() => {
    if (!mapData || isLoading || error) return;
    // console.log(`App.jsx: Setting up polling interval: ${POLLING_INTERVAL_MS / 1000} seconds.`);
    const intervalId = setInterval(fetchSystemState, POLLING_INTERVAL_MS);
    return () => {
        // console.log("App.jsx: Clearing polling interval.");
        clearInterval(intervalId);
    };
  }, [fetchSystemState, mapData, isLoading, error]);

  return (
    <div className="container mx-auto p-4 font-sans">
      <header className="mb-6 flex justify-between items-center">
        <h1 className="text-4xl font-bold text-blue-600">Smart Traffic Management</h1>
        <div className="text-lg text-gray-600">
            Sim Time: <span className="font-semibold">{simulationTime.toFixed(1)}s</span>
            {isSystemUpdating && <span className="text-sm text-blue-500 ml-2">(Syncing...)</span>}
        </div>
      </header>
      
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4" role="alert">{error}</div>}
      {isLoading && <div className="text-center p-4 text-blue-500">Initializing Map...</div>}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gray-50 p-1 rounded-lg shadow">
          <h2 className="text-2xl font-semibold mb-1 p-3 text-gray-700">City Map</h2>
          {currentNodes.length > 0 ? (
            <MapDisplay
              nodes={currentNodes}
              edges={currentEdges}
              vehicles={vehicles}
              roadConditions={roadConditions} // Crucial prop
              svgWidth={800} 
              svgHeight={600}
            />
          ) : !isLoading && (
            <p className="text-center p-10 text-gray-500">Map not loaded.</p>
          )}
        </div>

        <div className="md:col-span-1 bg-gray-50 p-4 rounded-lg shadow">
          <ControlPanel
            nodes={currentNodes}
            edges={currentEdges}
            vehicles={vehicles}
            onSystemUpdate={fetchSystemState} // Allows ControlPanel to trigger a refresh
            setError={setError}
            onMapLoad={initializeMap}
          />
        </div>
      </div>

      {/* Traffic Light Status Display */}
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
                    {Object.keys(light.green_times).length === 0 && <li className="text-gray-500">No timings.</li>}
                  </ul>
                </li>
              ))}
            </ul>
          ) : <p>No traffic light data.</p>}
        </div>
        {/* Tracked Vehicles Display */}
        <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-2xl font-semibold mb-3 text-gray-700">Tracked Vehicles</h2>
            {vehicles.length > 0 ? (
                <ul className="space-y-1 max-h-60 overflow-y-auto text-xs">
                    {vehicles.map(v => (
                        <li key={v.id} className="p-1.5 border rounded">
                            <div className="font-semibold">ID: {v.id} ({v.state})</div>
                            <div>Dest: {v.destination_node_id}</div>
                            <div>At: {v.current_node_id}
                                {v.current_road_segment && ` (On: ${v.current_road_segment[0]}→${v.current_road_segment[1]})`}
                            </div>
                            {v.current_path && v.current_path.length > 0 &&
                                <div className="truncate">Path: {v.current_path.join('→')}</div>
                            }
                        </li>
                    ))}
                </ul>
            ) : <p>No vehicles.</p>}
        </div>
      </div>
       
       {/* Road Conditions Table Display */}
       <div className="mt-6 bg-white p-4 rounded-lg shadow">
          <h2 className="text-2xl font-semibold mb-3 text-gray-700">Road Conditions</h2>
           {Object.keys(roadConditions).length > 0 ? (
            <div className="overflow-x-auto max-h-80">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Road</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Congestion</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Vehicles</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase">Time(s)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(roadConditions).map(([roadId, data]) => (
                    <tr key={roadId}>
                      <td className="px-3 py-1.5 whitespace-nowrap font-medium text-gray-900">{roadId}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">
                        <div className="flex items-center"><div className="w-16 bg-gray-200 rounded-full h-2 mr-1"><div className={`h-2 rounded-full ${data.current_congestion > 0.7 ? 'bg-red-600' : data.current_congestion > 0.4 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${(data.current_congestion || 0) * 100}%`}}></div></div><span>{((data.current_congestion || 0) * 100).toFixed(0)}%</span></div>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{data.current_vehicles}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{data.current_travel_time ? data.current_travel_time.toFixed(1) : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>No road condition data available.</p>}
        </div>
    </div>
  );
}
export default App;