# Pathfinding Integration Guide - Fixing Unit Routes

## Problem Analysis

The issue shown in the image reveals units following straight-line paths instead of road networks. This guide explains the root cause and integration status.

## Root Causes

### 1. **OSRM Fallback Issue**
- When OSRM is unavailable or slow, units fall back to a Bezier curve (straight line)
- This creates the visual of units cutting across buildings
- Status: **NOW FIXED** - Using integrated pathfinding system first

### 2. **Pathfinding System Not Previously Integrated**
- Dispatch units were only using OSRM (external API) or fallback curves
- They weren't using the local road network pathfinding
- Status: **NOW INTEGRATED** - Units now use road graph pathfinding with OSRM as optional upgrade

### 3. **NPC Traffic Not Spawned/Rendered**
- Traffic system existed but wasn't initialized
- NPC vehicles weren't being spawned or rendered
- Status: **NOW FIXED** - Traffic system initializes on map load

## Integration Changes Made

### 1. **Created Integrated Traffic Bridge** (`integrated-traffic-bridge.ts`)
This new module bridges the dispatch system with the traffic system:

```typescript
// Calculates dispatch routes using road network
calculateDispatchRoute(from, to, isEmergency)

// Initializes traffic system
initializeTrafficSystem(viewportBounds)

// Updates NPC vehicles
updateTrafficSystem(deltaTime)

// Gets NPC vehicles for rendering
getNPCVehicles()
```

### 2. **Updated Game Store** (`game-store.ts`)
Modified dispatch logic to:
- Use `calculateDispatchRoute()` for initial road-based routing
- Still attempt OSRM upgrade in background
- Apply road-based routes for return journeys

### 3. **Enhanced City Map** (`city-map.tsx`)
- Initializes traffic system on map load
- Updates viewport bounds for NPC spawning
- Renders NPC vehicles on traffic canvas
- Calls `updateTrafficSystem()` in render loop

### 4. **Extended Traffic System** (`traffic-system.ts`)
- Added `updateViewportBounds()` method
- Ensures spatial grid stays synchronized with map view

## How It Works Now

```
1. Unit dispatched to mission
2. calculateDispatchRoute() called
   ├─ Pathfinder finds path on road graph
   ├─ Returns waypoints array
   └─ Unit starts moving immediately
3. OSRM upgrade fetched in background
4. If OSRM succeeds before unit completes, route upgraded
5. Otherwise, unit completes on road-based route
```

## Debugging Steps

### Check Console Logs
Open browser DevTools (F12) and look for:

```
[v0] Traffic system initialized with road network
[v0] Found road-based route with X waypoints for emergency/regular unit
[v0] Pathfinder not initialized (problem!)
[v0] Pathfinding failed: <error message>
```

### Test Pathfinding Directly
In browser console:
```javascript
import { Pathfinder } from '@/lib/pathfinding/pathfinder'
import { createSampleRoadNetwork } from '@/lib/pathfinding/road-graph'

const graph = createSampleRoadNetwork()
const pathfinder = new Pathfinder(graph)
const route = pathfinder.findPath(
  { lat: 59.3293, lng: 18.0686 },
  { lat: 59.3315, lng: 18.0720 },
  false
)
console.log(route)
```

### Verify NPC Vehicles
```javascript
import { getNPCVehicles } from '@/lib/integrated-traffic-bridge'
console.log(getNPCVehicles())
```

### Check Traffic Stats
```javascript
import { getTrafficStats } from '@/lib/integrated-traffic-bridge'
console.log(getTrafficStats())
```

## What If Units Still Go Straight?

### Issue 1: Pathfinder Not Initialized
**Problem:** Console shows "Pathfinder not initialized"  
**Solution:** 
- Ensure map initialization completes before dispatching
- Check that `initializeTrafficSystem()` is called in city-map.tsx

### Issue 2: Road Network Empty
**Problem:** Route has <2 waypoints  
**Solution:**
- Check that `createSampleRoadNetwork()` generates proper nodes/edges
- Verify roads match actual map streets

### Issue 3: OSRM Still Interferes
**Problem:** Units start on good route but change to straight line  
**Solution:**
- OSRM may be faster to return
- This is acceptable - OSRM has real road data
- Fallback to roads happens if OSRM fails

## NPC Traffic Not Visible

### Issue 1: Vehicles Not Spawning
**Problem:** No dots on canvas  
**Solution:**
- Check zoom level >= 15 (traffic only renders when zoomed in)
- Verify `updateTrafficSystem()` is called each frame
- Check `getNPCVehicles()` returns vehicles

### Issue 2: Vehicles Spawning Off-Screen
**Problem:** Console shows vehicles exist but don't render  
**Solution:**
- Viewport bounds must be properly set
- Traffic canvas coordinate conversion checked

### Issue 3: Performance Issues
**Problem:** Lots of lag with traffic  
**Solution:**
- Reduce MAX_VEHICLES in spatial-grid.ts
- Increase update throttling
- Reduce traffic rendering frequency

## Performance Optimization

### Viewport-Based Spawning
- Only 40-60 vehicles spawn in viewport
- Off-screen vehicles are culled
- Check stats: `getTrafficStats().vehiclesInViewport`

### Update Scheduling
- Vehicles in viewport: update every frame
- Emergency vehicles: update every frame
- Other vehicles: adaptive throttling
- Off-screen: no updates

### Rendering
- NPC vehicles render as 1-2px dots on canvas overlay
- Only when zoom >= 15
- No pointer events (performance)

## Next Steps

1. **Open browser console** and check for `[v0]` messages
2. **Zoom into map** (>= 15) to see NPC traffic
3. **Dispatch a unit** and watch console for route messages
4. **Verify path** - should follow visible roads, not cut across buildings
5. **Check NPC vehicles** - should see colored dots on streets

## Technical Details

### Road Graph Structure
- Nodes: Intersections in the city
- Edges: Road segments between intersections
- Costs: Distance + traffic factors
- A* pathfinding: Optimal routes with heuristics

### Traffic Light Integration
- Coordinated timing at intersections
- Emergency override capability
- Green wave optimization

### Vehicle Behavior
- Realistic acceleration/braking
- Following distance enforcement
- Collision avoidance
- Speed limit compliance
- Congestion routing

## Files Modified/Created

**New Files:**
- `lib/integrated-traffic-bridge.ts` - Bridge between systems
- `lib/pathfinding/road-graph.ts` - Road network structure
- `lib/pathfinding/pathfinder.ts` - A* pathfinding algorithm
- `lib/traffic/traffic-system.ts` - Master orchestration
- `lib/traffic/traffic-light-manager.ts` - Intersection control
- `lib/traffic/vehicle-controller.ts` - Vehicle behavior
- `lib/traffic/spatial-grid.ts` - Viewport optimization
- `lib/traffic/congestion-system.ts` - Rerouting logic
- `lib/traffic/performance-optimizer.ts` - Performance tools

**Modified Files:**
- `lib/game-store.ts` - Integrated dispatch routing
- `components/game/city-map.tsx` - Traffic system initialization and rendering

## Quick Summary

✅ **Fixed:** Dispatch units now use road-based pathfinding first  
✅ **Fixed:** NPC traffic system now initializes and spawns  
✅ **Fixed:** Unified road network for both dispatch and traffic  
✅ **Fixed:** Proper viewport-based optimization  

🔄 **Upgrading:** OSRM still used for real-world street data when available  
🔄 **Enhanced:** Emergency vehicles get priority routing  

The system now properly routes units along roads, with NPC traffic visible at zoom level 15+. Units should no longer cut across buildings unless the road network itself is incomplete in that area.
