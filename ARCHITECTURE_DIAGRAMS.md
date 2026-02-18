# NPC Traffic System - Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GAME LOOP (Your Code)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. Update viewport bounds                                           │   │
│  │ 2. Call trafficSystem.update(deltaTime)                            │   │
│  │ 3. Render vehicles from trafficSystem.getViewportVehicles()        │   │
│  │ 4. Handle player events (spawn emergency, create incident, etc)    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │    TRAFFIC SYSTEM              │
        │   (traffic-system.ts)          │
        │                                │
        │  • Orchestrates all systems    │
        │  • Manages vehicle lifecycle   │
        │  • Handles performance tuning  │
        │  • Provides statistics         │
        └────────────┬───────────────────┘
                     │
        ┌────────────┴───────────────────┬──────────────────────┬──────────────────┐
        │                                │                      │                  │
        ▼                                ▼                      ▼                  ▼
   ┌─────────────┐            ┌──────────────────┐   ┌─────────────────┐   ┌──────────────┐
   │   ROAD      │            │    VEHICLE       │   │   TRAFFIC LIGHT │   │  SPATIAL     │
   │   GRAPH     │            │   CONTROLLER     │   │   MANAGER       │   │  GRID        │
   │             │            │                  │   │                 │   │              │
   │ • Nodes     │            │ • Movement       │   │ • Phases        │   │ • Viewport   │
   │ • Edges     │            │ • Collision      │   │ • Timing        │   │ • Culling    │
   │ • Occupancy │            │ • Traffic rules  │   │ • Emergency     │   │ • Queries    │
   │             │            │ • States        │   │ • Coordination  │   │              │
   └──────┬──────┘            └────────┬─────────┘   └────────┬────────┘   └──────────────┘
          │                           │                      │
          │                           │                      │
          └───────────┬───────────────┴──────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────┐
        │  CONGESTION & REROUTING          │
        │  (congestion-system.ts)          │
        │                                  │
        │ • Monitors traffic density       │
        │ • Detects congestion            │
        │ • Triggers rerouting            │
        │ • Manages incidents             │
        └──────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────┐
        │  PERFORMANCE OPTIMIZER           │
        │  (performance-optimizer.ts)      │
        │                                  │
        │ • Adaptive throttling            │
        │ • FPS monitoring                │
        │ • Memory pooling                │
        │ • Update scheduling             │
        └──────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────┐
        │  PATHFINDING ENGINE              │
        │  (pathfinder.ts)                 │
        │                                  │
        │ • A* algorithm                   │
        │ • Two routing modes              │
        │ • Dynamic cost calculation       │
        │ • Route caching                 │
        └──────────────────────────────────┘
```

## Data Flow - Vehicle Update Cycle

```
              START FRAME
                 │
                 ▼
    ┌────────────────────────┐
    │ Update all traffic     │
    │ lights + timing        │
    └────────┬───────────────┘
             │
             ▼
    ┌────────────────────────────────┐
    │ Update congestion monitor      │
    │ (track vehicle occupancy)      │
    └────────┬───────────────────────┘
             │
             ▼
    ┌────────────────────────────────┐
    │ Get vehicles to update         │
    │ (smart scheduling)             │
    │                                │
    │ Priority 1: Emergency vehicles │
    │ Priority 2: Viewport vehicles  │
    │ Priority 3: Off-screen (1/N)   │
    └────────┬───────────────────────┘
             │
             ▼
    ┌────────────────────────────────┐
    │ FOR EACH VEHICLE               │
    └────────┬───────────────────────┘
             │
    ┌────────┴─────────────────────────────────┐
    │                                          │
    ▼                                          ▼
┌─────────────────────────┐        ┌──────────────────────────┐
│ Check for rerouting     │        │ Get nearby vehicles      │
│ - High congestion       │        │ - For collision avoid    │
│ - Blocked segment       │        │ - For interaction        │
└────────┬────────────────┘        └──────────┬───────────────┘
         │                                    │
         ▼                                    ▼
    ┌──────────────────┐           ┌──────────────────────┐
    │ Calculate desired│           │ Update vehicle state │
    │ velocity:        │           │                      │
    │ - Traffic light  │           │ • Velocity           │
    │ - Vehicle ahead  │           │ • Heading            │
    │ - Congestion     │           │ • State machine      │
    │ - Emergency mode │           │ • Following distance │
    └────────┬─────────┘           └──────┬───────────────┘
             │                            │
             └────────┬─────────┬─────────┘
                      │         │
                      ▼         ▼
            ┌──────────────────────────────┐
            │ Move vehicle along route     │
            │ - Apply velocity            │
            │ - Smooth acceleration       │
            │ - Update heading            │
            └────────┬─────────────────────┘
                     │
                     ▼
            ┌──────────────────────────────┐
            │ Update spatial grid          │
            │ (track position for queries) │
            └────────┬─────────────────────┘
                     │
                     ▼
            ┌──────────────────────────────┐
            │ Check if stuck/off-screen    │
            │ - Reroute if needed         │
            │ - Clean up if far away      │
            └────────┬─────────────────────┘
                     │
                     ▼
            ┌──────────────────────────────┐
            │ NEXT VEHICLE                 │
            └─────────────────────────────┘
                     │
                     ▼
            ┌──────────────────────────────┐
            │ Spawn new vehicles from      │
            │ queue (if room available)    │
            └────────┬─────────────────────┘
                     │
                     ▼
            ┌──────────────────────────────┐
            │ Update emergency states      │
            │ - Signal traffic lights      │
            │ - Check if reached goal      │
            └────────┬─────────────────────┘
                     │
                     ▼
            ┌──────────────────────────────┐
            │ Update performance metrics   │
            │ - FPS tracking              │
            │ - Adaptive throttling       │
            │ - Memory monitoring         │
            └────────┬─────────────────────┘
                     │
                     ▼
              FRAME COMPLETE
             Return stats to game
```

## Pathfinding & Routing Decision Tree

```
┌────────────────┐
│ Vehicle needs │
│ new route     │
└────────┬───────┘
         │
         ▼
    Is it emergency?
    /              \
  YES              NO
  /                  \
 ▼                    ▼
Use emergency    Use regular
pathfinding      pathfinding
(ignore traffic) (consider traffic)
 │                    │
 └──────────┬─────────┘
            │
            ▼
   A* pathfinding
   on road graph
   /             \
Success       Failed
 /               \
▼                 ▼
Return        Try fallback:
route        • Alternative destination
             • Straight line nav
             • Stuck recovery
```

## Vehicle Behavior State Machine

```
┌──────────────────────────────────────────────────┐
│              VEHICLE STATE MACHINE               │
└────────────────────┬─────────────────────────────┘

                    ┌─────────┐
                    │  IDLE   │
                    │         │
                    │ Waiting │
                    └────┬────┘
                         │ Route assigned
                         │ & velocity > 0
                         ▼
            ┌────────────────────────┐
            │    MOVING              │
            │                        │
            │ Following waypoints    │
            │ Accelerating/cruising  │
            └────┬──────┬────┬───────┘
                 │      │    │
        Obstacle │      │    │ Light changes
        ahead    │      │    │ to red
                 │      │    │
                 ▼      ▼    ▼
        ┌──────────────────────────┐
        │    BRAKING               │
        │                          │
        │ Decelerating toward      │
        │ obstacle/light           │
        └────────┬────────┬────────┘
                 │        │
         Speed=0 │        │ Obstacle cleared/
         reached │        │ light turns green
                 ▼        ▼
            ┌──────────────────────┐
            │    YIELDING          │
            │                      │
            │ Stopped, waiting     │
            │ for conditions       │
            └────────────┬─────────┘
                         │ Conditions met
                         │ or timeout
                         ▼
                    (Back to MOVING
                     or IDLE)
```

## Traffic Flow Example - Intersection Interaction

```
Intersection with traffic light:

     N
     │
  ═══╋═══ (Lane 1: N-S traffic)
  ───┼─── (Lane 2: E-W traffic)
  W──┼──E
     │
     S

Time 0: N-S is GREEN, E-W is RED
├─ Vehicle A (moving North): ✓ Can proceed
├─ Vehicle B (moving East):  ✗ Wait at red light
└─ Vehicle C (moving South): ✓ Can proceed

    A
    ↑
    │
B ←─┼─→ ?
    │
    C
    ↓

Time 15s: Cycle change, E-W is GREEN, N-S is RED
├─ Vehicle A: Already passed, now far North
├─ Vehicle B: ✓ Now proceeds East
├─ Vehicle C: ✗ Now stopped by red light
└─ Vehicle D (new): Moving North, ✗ Waits

Emergency vehicle approaches from North with siren:
├─ Detector: North-S traffic light signals emergency
├─ Response: Phase changes early to GREEN for North-S
├─ Result: All N-S traffic gets green wave for faster transit

```

## Performance Optimization - Update Scheduling

```
Frame 1:  All vehicles need update
┌─────────┬─────────┬─────────┬─────────┐
│Emergency│Viewport │Off-screen │Off-screen│
│Vehicle  │Vehicle  │(may not   │(may not  │
│         │         │ update)   │ update)  │
└─────────┴─────────┴─────────┴─────────┘
   ✓       ✓          ?          ?
 Update  Update    (Skip)     (Skip)

Frame 2:
┌─────────┬─────────┬─────────┬─────────┐
│Emergency│Viewport │Off-screen │Off-screen│
│Vehicle  │Vehicle  │           │          │
│         │         │(now ready │ (skip)   │
│         │         │ to update)│          │
└─────────┴─────────┴─────────┴─────────┘
   ✓       ✓          ✓         ?
 Update  Update      Update   (Skip)

Frame 3:
┌─────────┬─────────┬─────────┬─────────┐
│Emergency│Viewport │Off-screen │Off-screen│
│Vehicle  │Vehicle  │ (skip)    │(now ready)│
│         │         │           │          │
└─────────┴─────────┴─────────┴─────────┘
   ✓       ✓          ?          ✓
 Update  Update     (Skip)     Update

Pattern: Emergency & Viewport EVERY FRAME
         Off-screen vehicles: ROTATING SCHEDULE
         Adaptive based on FPS
```

## Memory Layout

```
┌─────────────────────────────────────┐
│   Traffic System Instance           │
├─────────────────────────────────────┤
│                                     │
│  Road Graph (Static)                │
│  ├─ 25 nodes × ~200 bytes           │
│  ├─ 200 edges × ~150 bytes          │
│  └─ Total: ~30-40 KB                │
│                                     │
│  Vehicle Objects (Dynamic)          │
│  ├─ 50 vehicles × ~2 KB each        │
│  ├─ Position, velocity, state       │
│  ├─ Route waypoints (shared)        │
│  └─ Total: ~100 KB                  │
│                                     │
│  Traffic Lights (Static)            │
│  ├─ 25 lights × ~1 KB               │
│  └─ Total: ~25 KB                   │
│                                     │
│  Spatial Grid (Dynamic)             │
│  ├─ 20-30 cells × ~500 bytes        │
│  ├─ Vehicle ID lists                │
│  └─ Total: ~10-20 KB                │
│                                     │
│  Route Cache (Dynamic)              │
│  ├─ 10-20 cached routes             │
│  ├─ ~5 KB per route                 │
│  └─ Total: ~50-100 KB               │
│                                     │
│  State & Statistics                 │
│  ├─ Frame timings, metrics          │
│  └─ Total: ~10 KB                   │
│                                     │
│  TOTAL: ~200-250 KB (well under 50MB target)
└─────────────────────────────────────┘
```

This architecture ensures optimal performance while maintaining realistic and autonomous traffic behavior.
