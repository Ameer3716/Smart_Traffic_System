import networkx as nx
from typing import List, Dict, Tuple, Optional
from app.models import CityMap, Node as ModelNode, Edge as ModelEdge # Ensure these are correct

# For optional image generation (not directly used by ReactFlow live viz)
import matplotlib 
matplotlib.use('Agg') # Use non-interactive backend for Matplotlib
import matplotlib.pyplot as plt
import io
import base64

CITY_GRAPH = nx.DiGraph()
ROAD_DATA: Dict[Tuple[str, str], Dict] = {}
NODE_POSITIONS: Dict[str, Tuple[float, float]] = {} # Store calculated/loaded positions

def load_map(city_map: CityMap):
    """Loads the city map, calculates/stores node positions."""
    global CITY_GRAPH, ROAD_DATA, NODE_POSITIONS
    CITY_GRAPH.clear()
    ROAD_DATA.clear()
    NODE_POSITIONS.clear()

    all_coords_provided_in_json = True
    if not city_map.nodes:
        all_coords_provided_in_json = False

    for node_data in city_map.nodes:
        CITY_GRAPH.add_node(node_data.id, name=node_data.name)
        if node_data.x is not None and node_data.y is not None:
            NODE_POSITIONS[node_data.id] = (node_data.x, node_data.y)
        else:
            all_coords_provided_in_json = False

    if not all_coords_provided_in_json and CITY_GRAPH.number_of_nodes() > 0:
        print("Node coordinates not fully provided or missing; calculating layout using NetworkX spring_layout.")
        try:
            # Use a layout algorithm from NetworkX
            raw_positions = nx.spring_layout(CITY_GRAPH, seed=42, k=0.8, iterations=50) # k for spacing
            
            # Normalize and scale positions for frontend display (e.g., 0-1000 for x, 0-600 for y)
            min_x, max_x = float('inf'), float('-inf')
            min_y, max_y = float('inf'), float('-inf')
            
            # Check if raw_positions is empty or has only one node
            if not raw_positions: # Handle empty graph case
                pass
            elif len(raw_positions) == 1: # Handle single node case
                node_id = list(raw_positions.keys())[0]
                min_x, max_x, min_y, max_y = 0,1,0,1 # Dummy range for single node
                raw_positions[node_id] = [0.5,0.5] # Center it
            else:
                for node_id_pos in raw_positions: # Corrected variable name
                    pos_val = raw_positions[node_id_pos] # Corrected variable name
                    min_x, max_x = min(min_x, pos_val[0]), max(max_x, pos_val[0])
                    min_y, max_y = min(min_y, pos_val[1]), max(max_y, pos_val[1])

            target_width = 1000
            target_height = 600
            
            for node_id_pos in raw_positions: # Corrected variable name
                pos_val = raw_positions[node_id_pos] # Corrected variable name
                # Scale and shift:
                # Handle division by zero if all nodes are at the same point
                scaled_x = ((pos_val[0] - min_x) / (max_x - min_x) if (max_x - min_x) != 0 else 0.5) * target_width
                scaled_y = ((pos_val[1] - min_y) / (max_y - min_y) if (max_y - min_y) != 0 else 0.5) * target_height
                NODE_POSITIONS[node_id_pos] = (scaled_x, scaled_y) # Corrected variable name
        except Exception as e:
            print(f"Error generating graph layout: {e}. Placing nodes manually as a fallback.")
            for i, node_id_iter in enumerate(CITY_GRAPH.nodes()): # Corrected variable name
                NODE_POSITIONS[node_id_iter] = (i * 150, 100 + (i % 3) * 100) # Basic fallback
    elif all_coords_provided_in_json:
        print("Using node coordinates provided in map data.")
    
    for edge_data in city_map.edges:
        source, target = edge_data.source, edge_data.target
        base_time = edge_data.base_travel_time
        capacity = edge_data.capacity
        CITY_GRAPH.add_edge(source, target, base_travel_time=base_time, current_travel_time=base_time)
        ROAD_DATA[(source, target)] = {
            "base_travel_time": base_time,
            "capacity": capacity,
            "current_congestion": 0.0,
            "current_vehicles": 0
        }
        # If two-way: also add (target, source)

    print(f"Map loaded: {CITY_GRAPH.number_of_nodes()} nodes, {CITY_GRAPH.number_of_edges()} edges. Positions established.")
    return True

def get_graph_data_for_visualization() -> Dict:
    """Prepares graph data for frontend visualization (React Flow)."""
    if not CITY_GRAPH:
        return {"nodes": [], "edges": []}

    nodes_viz = []
    for node_id, node_data_attrs in CITY_GRAPH.nodes(data=True): # Corrected variable name
        position = NODE_POSITIONS.get(node_id, (0,0))
        nodes_viz.append({
            "id": node_id,
            "data": {"label": node_data_attrs.get("name", node_id)},
            "position": {"x": position[0], "y": position[1]},
            "type": "default" # React Flow default node type
        })

    edges_viz = []
    road_conditions = get_current_road_conditions()
    for u, v, edge_data_attrs in CITY_GRAPH.edges(data=True): # Corrected variable name
        road_id_str = f"{u}-{v}"
        condition = road_conditions.get(road_id_str, {})
        congestion = condition.get("current_congestion", 0.0)
        
        edge_color = "#66cc66" # Default green
        if congestion > 0.75: edge_color = "#ff4d4d" # Red
        elif congestion > 0.5: edge_color = "#ffc24d" # Orange
        elif congestion > 0.25: edge_color = "#ffff4d" # Yellow

        label_text = f"{condition.get('current_travel_time', edge_data_attrs.get('base_travel_time', 0)):.0f}s"
        if 'current_vehicles' in condition and condition['current_vehicles'] > 0:
             label_text += f" ({condition['current_vehicles']}v)"


        edges_viz.append({
            "id": f"edge-{u}-{v}",
            "source": u,
            "target": v,
            "label": label_text,
            "style": {"stroke": edge_color, "strokeWidth": 2 + (congestion * 4)},
            "animated": congestion > 0.6, # Animate highly congested roads
            "type": "default", # Or "smoothstep"
            "markerEnd": {"type": "arrowclosed", "color": edge_color} # Add arrow heads
        })
    
    return {"nodes": nodes_viz, "edges": edges_viz}

def draw_graph_to_png_base64() -> Optional[str]:
    """(Optional) Draws graph to a PNG image, returns base64 string."""
    if not CITY_GRAPH or CITY_GRAPH.number_of_nodes() == 0: return None
    plt.figure(figsize=(14, 11))
    pos = NODE_POSITIONS if NODE_POSITIONS else nx.spring_layout(CITY_GRAPH, seed=42)
    node_labels = {n_id: CITY_GRAPH.nodes[n_id].get("name", n_id) for n_id in CITY_GRAPH.nodes()}
    nx.draw_networkx_nodes(CITY_GRAPH, pos, node_size=600, node_color='skyblue', alpha=0.9)
    nx.draw_networkx_labels(CITY_GRAPH, pos, labels=node_labels, font_size=9)
    edge_colors_list = []
    edge_labels_map = {}
    for u, v, _ in CITY_GRAPH.edges(data=True):
        congestion = ROAD_DATA.get((u,v), {}).get("current_congestion", 0.0)
        color = 'g'; 
        if congestion > 0.75: color = 'r'
        elif congestion > 0.5: color = 'orange'
        elif congestion > 0.25: color = 'y'
        edge_colors_list.append(color)
        edge_labels_map[(u,v)] = f"{CITY_GRAPH.edges[u,v].get('current_travel_time', 0):.0f}s"
    nx.draw_networkx_edges(CITY_GRAPH, pos, edge_color=edge_colors_list, width=1.5, arrows=True, arrowstyle='-|>', arrowsize=12, connectionstyle='arc3,rad=0.1')
    nx.draw_networkx_edge_labels(CITY_GRAPH, pos, edge_labels=edge_labels_map, font_size=7)
    plt.title("City Traffic Map Visualization", fontsize=16)
    plt.axis('off')
    buf = io.BytesIO(); plt.savefig(buf, format='png', bbox_inches='tight'); plt.close(); buf.seek(0)
    image_base64 = base64.b64encode(buf.read()).decode('utf-8'); buf.close()
    return image_base64

# --- Ensure other functions (get_graph_copy, update_traffic_on_road, etc.) are present ---
def get_graph_copy(): # Copied from your provided code
    return CITY_GRAPH.copy()

def update_traffic_on_road(road_id_str: str, congestion_level: Optional[float] = None, vehicle_count: Optional[int] = None): # Copied
    global CITY_GRAPH, ROAD_DATA
    try:
        source, target = road_id_str.split('-')
    except ValueError:
        print(f"Invalid road_id format: {road_id_str}. Expected 'source-target'.")
        return False

    if not CITY_GRAPH.has_edge(source, target):
        print(f"Road {source}-{target} not found in graph.")
        return False

    road_key = (source, target)
    if road_key not in ROAD_DATA: # Should not happen if map loaded correctly
        base_time = CITY_GRAPH.edges[source, target].get('base_travel_time', 10) 
        ROAD_DATA[road_key] = {"base_travel_time": base_time, "capacity": 100, "current_congestion": 0.0, "current_vehicles": 0}

    if congestion_level is not None:
        ROAD_DATA[road_key]["current_congestion"] = max(0.0, min(1.0, congestion_level))
    
    if vehicle_count is not None:
        ROAD_DATA[road_key]["current_vehicles"] = vehicle_count
        capacity = ROAD_DATA[road_key]["capacity"]
        if capacity > 0:
            derived_congestion = min(1.0, vehicle_count / (capacity * 1.5)) 
            ROAD_DATA[road_key]["current_congestion"] = derived_congestion
        else:
            ROAD_DATA[road_key]["current_congestion"] = 1.0 if vehicle_count > 0 else 0.0

    base_time = ROAD_DATA[road_key]["base_travel_time"]
    congestion = ROAD_DATA[road_key]["current_congestion"]
    penalty_factor = 1 + (4 * congestion) # Example: 1x to 5x
    current_travel_time = base_time * penalty_factor
    CITY_GRAPH.edges[source, target]['current_travel_time'] = current_travel_time
    return True

def get_current_road_conditions() -> Dict[str, Dict]: # Copied
    conditions = {}
    for (u,v), data in ROAD_DATA.items():
        road_id = f"{u}-{v}"
        conditions[road_id] = {
            "base_travel_time": data["base_travel_time"],
            "current_congestion": data["current_congestion"],
            "current_vehicles": data["current_vehicles"],
            "current_travel_time": CITY_GRAPH.edges[u,v]['current_travel_time'] if CITY_GRAPH.has_edge(u,v) else data["base_travel_time"]
        }
    return conditions

def get_roads_entering_intersection(intersection_id: str) -> List[Tuple[str, str]]: # Copied
    if not CITY_GRAPH.has_node(intersection_id): return []
    return [(u, v) for u, v in CITY_GRAPH.in_edges(intersection_id)]

def get_roads_leaving_intersection(intersection_id: str) -> List[Tuple[str, str]]: # Copied
    if not CITY_GRAPH.has_node(intersection_id): return []
    return [(u, v) for u, v in CITY_GRAPH.out_edges(intersection_id)]