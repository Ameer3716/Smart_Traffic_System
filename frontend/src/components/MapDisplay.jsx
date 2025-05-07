// frontend/src/components/MapDisplay.jsx
import React, { useState, useEffect, useMemo } from 'react';

const NODE_SIZE = 28;
const VEHICLE_WIDTH = 8;
const VEHICLE_LENGTH = 14;
const ROAD_WIDTH = 6;
const VEHICLE_PATH_HIGHLIGHT_WIDTH = 5;

const VEHICLE_COLORS = {
    on_route: "fill-sky-500",
    idle: "fill-orange-400",
    arrived: "fill-emerald-500",
    default: "fill-gray-500"
};

const MapDisplay = ({ nodes, edges, vehicles = [], roadConditions, svgWidth = 800, svgHeight = 600 }) => {
    const [nodePositions, setNodePositions] = useState({});

    // console.log('MapDisplay received roadConditions:', roadConditions); // For debugging

    useEffect(() => {
        if (nodes && nodes.length > 0) {
            const newPositions = {};
            const centerX = svgWidth / 2;
            const centerY = svgHeight / 2;
            const layoutRadius = Math.min(svgWidth, svgHeight) * 0.40; 
            const padding = NODE_SIZE * 1.5;

            nodes.forEach((node, index) => {
                if (node.x !== undefined && node.y !== undefined) {
                    const allX = nodes.filter(n => n.x !== undefined).map(n => n.x);
                    const allY = nodes.filter(n => n.y !== undefined).map(n => n.y);
                    const minX = allX.length > 0 ? Math.min(...allX) : 0;
                    const maxX = allX.length > 0 ? Math.max(...allX) : svgWidth;
                    const minY = allY.length > 0 ? Math.min(...allY) : 0;
                    const maxY = allY.length > 0 ? Math.max(...allY) : svgHeight;
                    const rangeX = (maxX - minX) || 1;
                    const rangeY = (maxY - minY) || 1;
                    newPositions[node.id] = {
                        x: ((node.x - minX) / rangeX) * (svgWidth - padding * 2) + padding,
                        y: ((node.y - minY) / rangeY) * (svgHeight - padding * 2) + padding,
                    };
                } else {
                    const angle = (index / nodes.length) * 2 * Math.PI - (Math.PI / 2);
                    newPositions[node.id] = {
                        x: centerX + layoutRadius * Math.cos(angle),
                        y: centerY + layoutRadius * Math.sin(angle),
                    };
                }
            });
            setNodePositions(newPositions);
        }
    }, [nodes, svgWidth, svgHeight]);

    const getCongestionColor = (congestion) => {
        if (congestion === undefined || congestion < 0) return 'stroke-slate-400';
        if (congestion > 0.75) return 'stroke-red-600';    // Target for heavy
        if (congestion > 0.4) return 'stroke-yellow-500'; // Target for moderate
        return 'stroke-green-500';
    };
    
    const renderedEdges = useMemo(() => {
        if (!edges || Object.keys(nodePositions).length === 0) return null;
        return edges.map((edge, index) => {
            const posSource = nodePositions[edge.source];
            const posTarget = nodePositions[edge.target];
            if (!posSource || !posTarget) return null;

            const roadId = `${edge.source}-${edge.target}`;
            const condition = roadConditions ? roadConditions[roadId] : null;
            // Ensure 'current_congestion' is correctly accessed.
            // Default to -1 or undefined if condition or current_congestion is missing.
            const congestionValue = condition && typeof condition.current_congestion === 'number' 
                                    ? condition.current_congestion 
                                    : -1; 
            const colorClass = getCongestionColor(congestionValue);

            // Debugging log for each edge:
            // if(roadId === "A-B" || roadId === "B-A") { // Example: focus on a specific road
            //    console.log(`Edge ${roadId}: condition=`, condition, `congestionValue=`, congestionValue, `colorClass=`, colorClass);
            // }
            
            return (
                <line
                    key={`edge-${edge.source}-${edge.target}-${index}`}
                    x1={posSource.x}
                    y1={posSource.y}
                    x2={posTarget.x}
                    y2={posTarget.y}
                    className={`${colorClass} transition-colors duration-300`}
                    strokeWidth={ROAD_WIDTH}
                    strokeLinecap="round"
                    markerEnd="url(#arrowhead-road)"
                />
            );
        });
    }, [edges, nodePositions, roadConditions]); // roadConditions is a key dependency

    // ... (renderedVehiclePaths, renderedVehicles, renderedNodes, and return statement are the same as previous)
    // (Make sure these sections are copied from the previous correct version)

    // Render highlighted paths for vehicles currently on route
    const renderedVehiclePaths = useMemo(() => {
        if (!vehicles || vehicles.length === 0 || Object.keys(nodePositions).length === 0) return null;
        return vehicles
            .filter(vehicle => vehicle.current_path && vehicle.current_path.length >= 2 && vehicle.state === 'on_route')
            .map((vehicle) => {
                const firstNodePos = nodePositions[vehicle.current_path[0]];
                if (!firstNodePos) return null;

                const d = vehicle.current_path.slice(1).reduce((acc, nodeId, i) => {
                    const posCurrent = nodePositions[nodeId];
                    const posPrev = nodePositions[vehicle.current_path[i]];
                    if (!posCurrent || !posPrev) return acc;
                    return `${acc} L ${posCurrent.x} ${posCurrent.y}`;
                }, `M ${firstNodePos.x} ${firstNodePos.y}`);
                
                return (
                    <path
                        key={`route-path-highlight-${vehicle.id}`}
                        d={d}
                        className="stroke-blue-400 opacity-60"
                        strokeWidth={VEHICLE_PATH_HIGHLIGHT_WIDTH}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                );
        });
    }, [vehicles, nodePositions]);

    // Render Vehicle Objects
    const renderedVehicles = useMemo(() => {
        if (!vehicles || vehicles.length === 0 || Object.keys(nodePositions).length === 0) return null;

        return vehicles.map(vehicle => {
            let posX, posY, angle = 0;

            if (vehicle.state === 'on_route' && vehicle.current_road_segment) {
                const [sourceId, targetId] = vehicle.current_road_segment;
                const sourcePos = nodePositions[sourceId];
                const targetPos = nodePositions[targetId];

                if (sourcePos && targetPos) {
                    let progress = 0.5; 
                    const roadId = `${sourceId}-${targetId}`;
                    const condition = roadConditions ? roadConditions[roadId] : null;
                    // Use current_travel_time from the specific road condition if available
                    const segmentTravelTime = condition && typeof condition.current_travel_time === 'number' && condition.current_travel_time > 0
                                            ? condition.current_travel_time
                                            : (vehicle.path_cost / (vehicle.current_path?.length || 1)); // Fallback to avg time per segment

                    if (segmentTravelTime > 0) {
                         progress = Math.min(1.0, Math.max(0.0, vehicle.time_on_current_segment / segmentTravelTime));
                    }
                    
                    posX = sourcePos.x + (targetPos.x - sourcePos.x) * progress;
                    posY = sourcePos.y + (targetPos.y - sourcePos.y) * progress;
                    angle = Math.atan2(targetPos.y - sourcePos.y, targetPos.x - sourcePos.x) * (180 / Math.PI);
                } else { 
                    const nodePos = nodePositions[vehicle.current_node_id];
                    if (!nodePos) return null;
                    posX = nodePos.x;
                    posY = nodePos.y;
                }
            } else { 
                const nodePos = nodePositions[vehicle.current_node_id];
                if (!nodePos) return null;
                posX = nodePos.x;
                posY = nodePos.y;
            }

            const vehicleColor = VEHICLE_COLORS[vehicle.state] || VEHICLE_COLORS.default;

            return (
                <g key={`vehicle-group-${vehicle.id}`} transform={`translate(${posX}, ${posY}) rotate(${angle})`}>
                    <rect 
                        x={-VEHICLE_LENGTH / 2} y={-VEHICLE_WIDTH / 2} 
                        width={VEHICLE_LENGTH} height={VEHICLE_WIDTH} 
                        className={`${vehicleColor} stroke-black stroke-[0.5px]`}
                        rx="2"
                    />
                    <rect 
                        x={VEHICLE_LENGTH / 2 - 4} y={-VEHICLE_WIDTH / 2 + 1} 
                        width="3" height={VEHICLE_WIDTH - 2}
                        className="fill-slate-300 opacity-70" rx="1"
                    />
                </g>
            );
        });
    }, [vehicles, nodePositions, roadConditions]); // roadConditions added as dependency for vehicle positioning too

    // Render Nodes (Intersections/Places)
    const renderedNodes = useMemo(() => {
        if (!nodes || Object.keys(nodePositions).length === 0) return null;
        return nodes.map(node => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            return (
                <g key={`node-group-${node.id}`} transform={`translate(${pos.x}, ${pos.y})`}>
                    <circle cx="0" cy="0" r={NODE_SIZE / 2} className="fill-slate-600 stroke-slate-800 stroke-2" />
                    <circle cx="0" cy="0" r={NODE_SIZE / 2 * 0.6} className="fill-slate-400" />
                    <text x="0" y={NODE_SIZE / 2 + 12} textAnchor="middle" className="fill-slate-800 text-[10px] font-medium pointer-events-none">{node.name || node.id}</text>
                    <text x="0" y="0" textAnchor="middle" dy=".3em" className="fill-white text-[9px] font-semibold pointer-events-none">{node.id}</text>
                </g>
            );
        });
    }, [nodes, nodePositions]);

    if (!nodes || nodes.length === 0) {
        return <p className="text-center text-gray-500 p-10">Map data not available or no nodes to display.</p>;
    }
    if (Object.keys(nodePositions).length === 0 && nodes.length > 0) {
        return <p className="text-center text-gray-500 p-10">Calculating node positions...</p>;
    }

    return (
        <div className="border p-1 rounded-lg shadow-md bg-slate-200" style={{ width: svgWidth, height: svgHeight, overflow: 'hidden' }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                <defs>
                    <marker id="arrowhead-road" markerWidth="8" markerHeight="8" refX="6" refY="2" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,4 L4,2 z" className="fill-current text-slate-500" />
                    </marker>
                </defs>
                <g id="edges-layer">{renderedEdges}</g>
                <g id="vehicle-paths-layer">{renderedVehiclePaths}</g>
                <g id="nodes-layer">{renderedNodes}</g>
                <g id="vehicles-layer">{renderedVehicles}</g>
            </svg>
            <div className="p-1.5 text-xs text-slate-700 flex flex-wrap justify-start items-center gap-x-3 gap-y-1">
                <strong className="mr-1">Legend:</strong>
                <span className="flex items-center"><span className="inline-block w-2.5 h-2.5 bg-green-500 mr-1 border border-slate-400 rounded-sm"></span>Light Traffic</span>
                <span className="flex items-center"><span className="inline-block w-2.5 h-2.5 bg-yellow-500 mr-1 border border-slate-400 rounded-sm"></span>Moderate</span>
                <span className="flex items-center"><span className="inline-block w-2.5 h-2.5 bg-red-600 mr-1 border border-slate-400 rounded-sm"></span>Heavy</span>
                <span className="flex items-center"><span className={`inline-block w-3 h-1.5 ${VEHICLE_COLORS.on_route.replace("fill-","bg-")} mr-1 border border-black rounded-sm`}></span>Vehicle (Moving)</span>
            </div>
        </div>
    );
};

export default MapDisplay;