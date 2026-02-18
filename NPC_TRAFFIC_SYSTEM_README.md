# NPC Traffic Pathing System - Complete Architecture Guide

## Overview

This is a production-ready NPC traffic pathing and simulation system designed for web-based games and simulations. It handles 40-60 vehicles with realistic traffic behaviors, emergency vehicle prioritization, and intelligent pathfinding while maintaining 60 FPS performance.

## System Architecture

### Core Components

#### 1. **Road Network Graph** (`lib/pathfinding/road-graph.ts`)
- Represents the city's road infrastructure as a directed graph
- **Nodes**: Intersections with traffic light states and capacity information
- **Edges**: Road segments with lanes, speed limits, turn restrictions, and occupancy tracking
- Supports bidirectional roads, one-way streets, and complex intersections

**Key Features:**
- Efficient node/edge lookup with spatial indexing
- Real-time occupancy tracking for traffic-aware routing
- Support for different road types (highway, main street, residential, small street)
- Turn restrictions to prevent unrealistic maneuvers

#### 2. **A* Pathfinding** (`lib/pathfinding/pathfinder.ts`)
- Intelligent pathfinding with two routing modes:
  - **Regular Vehicles**: Consider traffic density, road types, and turn penalties
  - **Emergency Vehicles**: Ignore traffic, can traverse unconventional routes

**Key Features:**
- Dynamic cost calculation based on current congestion
- Heuristic-based optimization for fast pathfinding
- Support for turn restrictions and road network constraints
- Path recalculation for stuck or heavily congested vehicles

#### 3. **Traffic Light Management** (`lib/traffic/traffic-light-manager.ts`)
- Synchronized traffic light timing across the network
- Each intersection cycles through N-S and E-W phases
- Emergency vehicle detection triggers early phase changes
- Supports both NS/EW and complex intersection patterns

**Key Features:**
- Coordinated timing to minimize bottlenecks
- Dynamic emergency priority override
- Configurable cycle times and phase durations
- Time-scale support for game acceleration

#### 4. **Vehicle Behavior Controller** (`lib/traffic/vehicle-controller.ts`)
- Individual vehicle state management and behavior
- Realistic traffic rule enforcement (traffic lights, yielding, speed limits)
- Smart collision avoidance and following distance management
- Adaptive acceleration/braking physics

**Key Features:**
- State machine for vehicle behaviors (idle, moving, braking, yielding)
- Reaction time simulation for realistic behavior
- Following distance management based on vehicle aggressiveness
- Support for emergency mode with special behaviors

#### 5. **Traffic System Orchestrator** (`lib/traffic/traffic-system.ts`)
- Master system coordinating all subsystems
- Manages vehicle lifecycle (spawn, update, cleanup)
- Integrates pathfinding, vehicle control, and traffic rules
- Handles performance optimization and statistics

**Key Features:**
- Smart update scheduling (emergencies every frame, regular vehicles on interval)
- Automatic rerouting for stuck vehicles
- Emergency vehicle prioritization and signal override
- Real-time traffic statistics and monitoring

#### 6. **Spatial Grid & Viewport Optimization** (`lib/traffic/spatial-grid.ts`)
- Efficient spatial indexing for viewport-based rendering
- Only spawns/updates vehicles in or near the viewport
- Rapid neighbor queries for collision detection and interaction

**Key Features:**
- O(1) viewport queries using spatial hashing
- Automatic cleanup of off-screen vehicles
- Configurable spawn margins for lookahead
- Grid statistics for performance monitoring

#### 7. **Congestion & Rerouting System** (`lib/traffic/congestion-system.ts`)
- Real-time monitoring of traffic density on each segment
- Predictive congestion analysis for routes
- Automatic rerouting when segments become congested
- Traffic incident system for creating dynamic congestion

**Key Features:**
- Continuous congestion level tracking (clear → moderate → heavy → gridlock)
- Predictive rerouting with 20% efficiency improvement threshold
- Adaptive traffic flow analysis with recommendations
- Support for traffic incidents (accidents, construction, hazards)

#### 8. **Performance Optimization** (`lib/traffic/performance-optimizer.ts`)
- Automatic update throttling based on FPS
- Frame rate monitoring and adaptive scheduling
- Memory pooling for reduced garbage collection
- Batch processing for cache efficiency

**Key Features:**
- Adaptive update frequency (1/1 to 1/3 throttle)
- FPS-based performance scaling
- Memory usage tracking
- Configurable performance thresholds

## Traffic Behavior Rules

### Regular Vehicles
1. **Stop at Red Lights**: Must wait for green phase in their direction
2. **Yielding**: Vehicles yield to cross-traffic at intersections
3. **Following Distance**: Maintain safe following distance from vehicle ahead
4. **Lane Discipline**: Stay in assigned lane when possible
5. **Speed Limits**: Respect per-road speed limits
6. **Congestion Slowdown**: Reduce speed in heavy traffic

### Emergency Vehicles
1. **Priority Override**: Can pass through red lights in their direction
2. **Siren Activation**: Traffic lights detect sirens and change phase early
3. **Aggressive Routing**: Can use opposite lanes and shortcuts
4. **Following Distance**: Reduced minimum distance
5. **Speed Increase**: 20-30% higher speed limit
6. **Traffic Signal Control**: Can force traffic lights to change

### Congestion Dynamics
- Vehicles form natural queues behind stopped vehicles
- Congestion spreads upstream on roads
- Bottlenecks self-resolve as traffic clears intersections
- Dynamic rerouting helps distribute traffic across alternate paths

## Performance Targets

| Metric | Target |
|--------|--------|
| Vehicle Count | 40-60 concurrent NPCs |
| Framerate | 60 FPS on mid-range devices |
| Update Time | < 10ms per frame |
| Memory Usage | < 50MB for NPC data |
| Grid Cells | ~20-30 active cells per frame |

## Usage Examples

### Basic Initialization
```typescript
import { TrafficSystem } from "./lib/traffic/traffic-system"

const viewportBounds = {
  north: 59.935,
  south: 59.895,
  east: 10.795,
  west: 10.710,
}

const trafficSystem = new TrafficSystem(viewportBounds, {
  maxVehicles: 50,
  gridSize: 5,
  enableEmergencies: true,
  enableTrafficLights: true,
})
```

### Spawning Vehicles
```typescript
// Regular traffic
trafficSystem.spawnVehicle(startPos, endPos, VehicleType.REGULAR_CAR)

// Emergency vehicle
trafficSystem.spawnEmergencyVehicle(startPos, destination, VehicleType.FIRE_TRUCK)
```

### Main Loop Integration
```typescript
function gameLoop() {
  const deltaTime = 0.016 // 60 FPS
  trafficSystem.update(deltaTime)
  
  const stats = trafficSystem.getStats()
  console.log(`Vehicles: ${stats.totalVehicles}, Congestion: ${stats.congestionLevel}`)
}
```

### Handling Events
```typescript
// Create traffic incident
congestionMonitor.addIncident({
  id: "incident_1",
  segmentId: "edge_42",
  type: "accident",
  severity: 0.8,
  createdAt: Date.now(),
  duration: 30000,
  affectedLanes: 2,
})

// Update viewport when camera moves
trafficSystem.setViewportBounds(newBounds)
```

## Key Design Decisions

### 1. **Two-Layer Pathfinding**
- **Strategic Layer**: A* on road network for route planning
- **Tactical Layer**: Local collision avoidance for immediate obstacles
- Reduces path recalculation overhead while maintaining smooth movement

### 2. **Viewport-Based Spawning**
- Only maintains vehicles in/near viewport to optimize memory
- Off-screen vehicles are removed when moving far away
- New vehicles spawned as viewport reveals new areas

### 3. **Smart Update Scheduling**
- Emergency vehicles and viewport vehicles update every frame
- Off-screen vehicles update every 2-3 frames
- Automatic throttling if FPS drops below threshold

### 4. **Synchronized Traffic Lights**
- Lights use offset timing to create "green waves"
- Reduces unnecessary stops at consecutive intersections
- Improves overall traffic flow efficiency

### 5. **Dynamic Rerouting**
- Vehicles continuously monitor their route for congestion
- Reroute only if new route is 20% better
- Prevents constant flip-flopping between routes

### 6. **Congestion as Emergent Behavior**
- No explicit congestion spawning
- Emerges naturally from vehicle behavior
- Realistic queue formation and breakdown

## Performance Optimization Techniques

### 1. **Spatial Grid**
- O(1) lookup of vehicles in viewport
- Efficient neighbor queries for collision detection
- Cell-based caching of vehicle positions

### 2. **Update Culling**
- Only update vehicles in expanded viewport (with lookahead)
- Batch updates for cache efficiency
- Frame-rate adaptive throttling

### 3. **Object Pooling**
- Reuse vehicle objects to reduce GC pressure
- Pool size configurable based on target vehicle count

### 4. **Predictive Caching**
- Pre-calculate trajectories to predict collisions
- Cache route segments for repeated paths
- Reduce per-frame calculation overhead

## Edge Case Handling

### Stuck Vehicles
1. Detected after 1.5 seconds of no movement
2. Automatic reroute attempted
3. If still stuck, try alternative destinations
4. Eventually cleaned up if far from viewport

### Traffic Deadlocks
1. Prevention: Road design avoids circular dependencies
2. Detection: Monitor vehicle wait times
3. Resolution: Yield rules prevent mutual blocking

### Emergency Vehicle Navigation
1. Can traverse against traffic
2. Can use multiple lanes
3. Can bypass normal turn restrictions
4. If fully blocked, attempts off-road routing

### Route Finding Failures
1. Snap to nearest road node if start/end off-network
2. Use straight-line navigation as fallback
3. Try alternative destinations if critical
4. Log failures for debugging

## Scalability Considerations

### Increasing Vehicle Count
- Disable non-critical vehicles when CPU usage high
- Reduce update frequency for background traffic
- Use spatial grid to manage complexity

### Expanding Network
- A* performance scales with O(n log n)
- Grid size affects pathfinding complexity
- Consider multi-level hierarchical pathfinding for very large networks

### Real Map Integration
- Can be adapted to use OpenStreetMap data
- Replace sample road generation with OSM parsing
- Maintain same pathfinding and traffic logic

## Debugging and Monitoring

### Available Statistics
```typescript
const stats = trafficSystem.getStats()
// totalVehicles: number of active NPCs
// vehiclesInViewport: vehicles currently visible
// averageSpeed: mean vehicle velocity
// congestionLevel: 0-1 network-wide congestion
// updateTimeMs: time spent updating traffic
// gridStats: spatial grid performance metrics
```

### Performance Metrics
```typescript
const metrics = performanceOptimizer.getMetrics(...)
// fps: current frames per second
// updateTimeMs: average frame time
// memoryUsageMb: JS heap usage
// vehiclesUpdatedPerFrame: update throttle level
```

### Console Logging
- Enable debug logs in VehicleController for vehicle behavior
- Monitor Pathfinder for route calculation issues
- Track TrafficLightManager phase changes

## Future Enhancements

1. **Pedestrian Simulation**: Add pedestrian crossings and behavior
2. **Parking System**: Vehicle parking and searching for spots
3. **Public Transport**: Buses and trains on fixed routes
4. **Weather Effects**: Rain/snow impact driving behavior
5. **Hierarchical Pathfinding**: For very large networks
6. **Machine Learning**: Adaptive traffic light timing based on patterns
7. **Multiplayer**: Coordinated traffic across networked clients

## Integration Checklist

- [ ] Create TrafficSystem instance in game initialization
- [ ] Call trafficSystem.update(deltaTime) in main loop
- [ ] Render vehicles using getViewportVehicles()
- [ ] Render roads using getRoadGraph()
- [ ] Update viewport bounds when camera moves
- [ ] Handle emergency events with spawnEmergencyVehicle()
- [ ] Monitor performance with getStats()
- [ ] Configure performance thresholds based on target device

## Technical Specifications

| Aspect | Specification |
|--------|---|
| Pathfinding Algorithm | A* with dynamic heuristics |
| Graph Size | 25 intersections, 200+ segments (grid-based) |
| Vehicle Count | 40-60 concurrent |
| Update Frequency | 60 Hz (adaptive throttling) |
| Traffic Light Cycle | 60 seconds coordinated timing |
| Spatial Grid Cell | ~100m (configurable) |
| Memory Per Vehicle | ~2KB (state + route data) |
| Pathfinding Cache | LRU with configurable size |

## License

This system is designed for integration into game and simulation projects. Modify and extend as needed for your specific requirements.
