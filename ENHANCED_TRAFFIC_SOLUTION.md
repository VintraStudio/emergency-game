## Enhanced Traffic System - Complete Solution

This document explains the comprehensive traffic system redesign that ensures dispatch units follow the road network and implements realistic NPC traffic.

## Problem Analysis

The original system had two issues:
1. **Units bypassed roads**: Dispatch units took direct Bezier curve paths, cutting through buildings
2. **No NPC traffic**: No ambient traffic vehicles existed on the map

### Root Causes

- **Bezier Fallback**: When OSRM routing was slow/unavailable, units started on straight-line Bezier curves
- **No Road Network Awareness**: The fallback route had no understanding of actual street layouts
- **No Ambient Traffic**: Only player-dispatched units existed; no autonomous vehicles

## Solution Architecture

### 1. Road Network Module (`lib/road-network.ts`)

Provides street-aware fallback routing:

```typescript
// Snap positions to nearest road
snapToNearestRoad(position, maxDistance)

// Generate street-aware fallback route
streetAwareRoute(from, to)

// Check if position is near road
isNearRoad(position, threshold)
```

**Key Features:**
- Defines major Stockholm roads (Hornsgatan, Sveavägen, Birger Jarlsgatan, etc.)
- Snaps route waypoints to nearest roads
- Provides better fallback when OSRM unavailable
- Road points stored as lat/lng coordinates

### 2. NPC Traffic System (`lib/npc-traffic.ts`)

Manages autonomous vehicles:

```typescript
interface NPCVehicle {
  id: string
  position: LatLng
  destination: LatLng
  route: LatLng[]
  routeIndex: number
  color: string
}
```

**Behavior:**
- Spawns vehicles at defined spawn points
- Drives along street-aware routes
- Auto-reassigns destinations when reached
- Limits to 8 vehicles max to preserve performance
- Viewport-aware (only updates vehicles in visible area)

### 3. Integration Points

#### Game Store (`lib/game-store.ts`)
- Dispatch units now use `streetAwareRoute()` as immediate fallback
- OSRM routes upgrade in background
- NPC traffic updated each game tick via `updateNPCTraffic(deltaTime)`

#### City Map (`components/game/city-map.tsx`)
- NPC vehicles rendered as small gray dots (size ~70% of player vehicles)
- Updated every 80ms to maintain ~12fps smooth traffic visualization
- Viewport bounds synchronized with NPC traffic system
- Both player and NPC traffic rendered on same canvas

## Route Upgrade Flow

```
Dispatch Unit
    ↓
[Immediate] streetAwareRoute() ← snapped to roads
    ↓
Unit moves along road-aware path
    ↓
[Background] OSRM request queued
    ↓
[On Success] Route upgraded to real street routing
    ↓
[On Failure] Continues on street-aware fallback
```

This ensures units **never** take direct paths—they always follow some road network, with better routes layered in when available.

## Performance Optimizations

1. **Viewport Culling**: Only render/update vehicles in visible map bounds
2. **Reduced NPC Count**: Limited to 8 concurrent NPC vehicles
3. **Canvas Rendering**: Traffic drawn on canvas (not individual markers)
4. **Update Scheduling**: Game loop updates NPC traffic every tick (200ms)
5. **Road Snapping**: Cached road positions for efficient lookups

## Testing

### Verify Street Awareness
1. Dispatch a unit with slow network
2. Watch it follow visible street curves, not straight lines
3. Confirm path snaps to major roads

### Verify NPC Traffic
1. Zoom to level 15+
2. Look for small gray dots on roads
3. Watch them drive along streets in loops

### Verify OSRM Upgrade
1. Dispatch unit (starts on street-aware route)
2. Open browser DevTools Network tab
3. Watch OSRM request succeed/fail
4. Route should upgrade to real streets when available

## File Changes Summary

**New Files:**
- `lib/road-network.ts` - Road snapping and street-aware routing
- `lib/npc-traffic.ts` - Autonomous vehicle system

**Modified Files:**
- `lib/game-store.ts` - Use streetAwareRoute(), update NPC traffic
- `components/game/city-map.tsx` - Render NPC vehicles, sync viewport bounds

**No Breaking Changes:**
- Existing OSRM system unchanged
- Existing vehicle movement logic unchanged
- Fallback is now smarter, not replaced
