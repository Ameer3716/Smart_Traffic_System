import React, { useState, useEffect, useMemo } from 'react';

const NODE_RADIUS = 20;
const STROKE_WIDTH_DEFAULT = 3;
const STROKE_WIDTH_ROUTE = 5;
const ROUTE_COLORS = ['#FF6347', '#4682B4', '#32CD32', '#FFD700', '#6A5ACD']; // Tomato, SteelBlue, LimeGreen, Gold, SlateBlue

const MapDisplay = ({ nodes, edges, routes, roadConditions, svgWidth = 600, svgHeight = 400 }) => {
    const [nodePositions, setNodePositions] = useState({});

    // Calculate node positions (simple circular layout)
    useEffect(() => {
        if (nodes && nodes.length > 0) {
            const newPositions = {};
            const radius = Math.min(svgWidth, svgHeight) * 0.35; // Adjusted radius for better spacing
            const centerX = svgWidth / 2;
            const centerY = svgHeight / 2;

            nodes.forEach((node, index) => {
                // If nodes have x, y, use them, otherwise calculate
                if (node.x !== undefined && node.y !== undefined) {
                     // Simple scaling if x,y are provided, assuming they are in a relative coordinate system
                    const minX = Math.min(...nodes.map(n => n.x || 0));
                    const maxX = Math.max(...nodes.map(n => n.x || 0));
                    const minY = Math.min(...nodes.map(n => n.y || 0));
                    const maxY = Math.max(...nodes.map(n => n.y || 0));
                    const rangeX = maxX - minX || 1;
                    const rangeY = maxY - minY || 1;
                    
                    newPositions[node.id] = {
                        x: ((node.x - minX) / rangeX) * (svgWidth - NODE_RADIUS*4) + NODE_RADIUS*2,
                        y: ((node.y - minY) / rangeY) * (svgHeight - NODE_RADIUS*4) + NODE_RADIUS*2,
                    };
                } else { // Fallback to circular layout
                    const angle = (index / nodes.length) * 2 * Math.PI - (Math.PI / 2); // Start from top
                    newPositions[node.id] = {
                        x: centerX + radius * Math.cos(angle),
                        y: centerY + radius * Math.sin(angle),
                    };
                }
            });
            setNodePositions(newPositions);
        }
    }, [nodes, svgWidth, svgHeight]);

    const getCongestionColor = (congestion) => {
        if (congestion === undefined) return 'stroke-gray-400'; // No data
        if (congestion > 0.75) return 'stroke-red-500';    // Heavy
        if (congestion > 0.4) return 'stroke-yellow-500'; // Moderate
        return 'stroke-green-500';                         // Light
    };
    
    const getEdgeStrokeWidth = (edge) => {
        // Example: make busier roads slightly thicker, or routes
        // This can be expanded
        const roadId = `${edge.source}-${edge.target}`;
        const onRoute = routes.some(route => {
            for(let i=0; i < route.path.length -1; i++){
                if(route.path[i] === edge.source && route.path[i+1] === edge.target) return true;
            }
            return false;
        });
        return onRoute ? STROKE_WIDTH_ROUTE : STROKE_WIDTH_DEFAULT;
    }


    const renderedEdges = useMemo(() => {
        if (!edges || Object.keys(nodePositions).length === 0) return null;
        return edges.map((edge, index) => {
            const posSource = nodePositions[edge.source];
            const posTarget = nodePositions[edge.target];
            if (!posSource || !posTarget) return null;

            const roadId = `${edge.source}-${edge.target}`;
            const condition = roadConditions ? roadConditions[roadId] : null;
            const congestion = condition ? condition.current_congestion : undefined;
            const colorClass = getCongestionColor(congestion);
            
            // Calculate offset for two-way streets if they are separate entries
            // For simplicity, this basic version might draw them on top of each other
            // A more advanced version would calculate slight offsets.

            return (
                <line
                    key={`edge-${edge.source}-${edge.target}-${index}`}
                    x1={posSource.x}
                    y1={posSource.y}
                    x2={posTarget.x}
                    y2={posTarget.y}
                    className={`${colorClass} transition-colors duration-300`}
                    strokeWidth={getEdgeStrokeWidth(edge)}
                    markerEnd="url(#arrowhead)" // Optional: if you define an arrowhead
                />
            );
        });
    }, [edges, nodePositions, roadConditions, routes]);

    const renderedRoutes = useMemo(() => {
        if (!routes || routes.length === 0 || Object.keys(nodePositions).length === 0) return null;
        return routes.map((route, routeIndex) => {
            const routePath = route.path;
            if (!routePath || routePath.length < 2) return null;

            const d = routePath.slice(1).reduce((acc, nodeId, i) => {
                const prevNodeId = routePath[i];
                const posCurrent = nodePositions[nodeId];
                const posPrev = nodePositions[prevNodeId];
                if (!posCurrent || !posPrev) return acc; // Skip segment if node position missing
                return `${acc} L ${posCurrent.x} ${posCurrent.y}`;
            }, `M ${nodePositions[routePath[0]]?.x || 0} ${nodePositions[routePath[0]]?.y || 0}`);
            
            // Offset paths slightly for visibility if multiple routes overlap
            const offset = (routeIndex % 5 - 2) * 2; // small offset

            return (
                <path
                    key={`route-${route.vehicle_id || routeIndex}`}
                    d={d}
                    stroke={ROUTE_COLORS[routeIndex % ROUTE_COLORS.length]}
                    strokeWidth={STROKE_WIDTH_ROUTE -1} // Slightly thinner than edge highlight
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    transform={`translate(${offset}, ${offset})`} // Apply offset
                    className="opacity-75 hover:opacity-100 transition-opacity"
                />
            );
        });
    }, [routes, nodePositions]);


    const renderedNodes = useMemo(() => {
        if (!nodes || Object.keys(nodePositions).length === 0) return null;
        return nodes.map(node => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            return (
                <g key={`node-group-${node.id}`}>
                    <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={NODE_RADIUS}
                        className="fill-blue-500 stroke-blue-700 stroke-2 hover:fill-blue-400 cursor-pointer"
                        onClick={() => console.log("Clicked node:", node.id)} // Example interaction
                    />
                    <text
                        x={pos.x}
                        y={pos.y}
                        textAnchor="middle"
                        dy=".3em" // Vertical alignment
                        className="fill-white font-semibold text-xs pointer-events-none"
                    >
                        {node.id}
                    </text>
                    <text
                        x={pos.x}
                        y={pos.y + NODE_RADIUS + 12} // Position label below node
                        textAnchor="middle"
                        className="fill-gray-700 text-xs pointer-events-none"
                    >
                        {node.name}
                    </text>
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
        <div className="border p-1 rounded-lg shadow-md bg-gray-100" style={{ width: svgWidth, height: svgHeight }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
                <defs>
                    <marker
                        id="arrowhead"
                        markerWidth="10"
                        markerHeight="7"
                        refX="8" // Adjust based on stroke width and desired appearance
                        refY="3.5"
                        orient="auto"
                    >
                        <polygon points="0 0, 10 3.5, 0 7" className="fill-current text-gray-500" />
                    </marker>
                </defs>
                
                {/* Render Edges first so nodes and routes are on top */}
                <g id="edges-layer">
                    {renderedEdges}
                </g>

                {/* Render Routes on top of general edges */}
                <g id="routes-layer">
                    {renderedRoutes}
                </g>

                {/* Render Nodes on top */}
                <g id="nodes-layer">
                    {renderedNodes}
                </g>
            </svg>
            <div className="p-2 text-xs text-gray-600">
                Legend:
                <span className="inline-block w-3 h-3 bg-green-500 mx-1"></span> Light Traffic
                <span className="inline-block w-3 h-3 bg-yellow-500 mx-1"></span> Moderate
                <span className="inline-block w-3 h-3 bg-red-500 mx-1"></span> Heavy
                | Routes: Colored Lines
            </div>
        </div>
    );
};

export default MapDisplay;