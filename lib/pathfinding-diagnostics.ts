/**
 * Diagnostic Tool: Check Pathfinding vs Actual Routes
 * 
 * This script helps diagnose why dispatch units might be following straight lines.
 * Run in browser console to see:
 * - Whether pathfinding is initialized
 * - What routes it generates
 * - How they compare to OSRM routes
 */

export async function diagnosePathfinding() {
  console.log(
    "%c=== PATHFINDING DIAGNOSTICS ===",
    "color: #00ff00; font-weight: bold; font-size: 14px",
  )

  // Check if traffic system initialized
  const { getTrafficSystem } = await import("@/lib/integrated-traffic-bridge")
  const traffic = getTrafficSystem()

  if (!traffic) {
    console.warn("%c❌ Traffic system not initialized", "color: #ff6600")
    console.log("The traffic system hasn't been initialized yet.")
    console.log("This usually happens during map load. Try again after the map loads.")
    return
  }

  console.log("%c✓ Traffic system initialized", "color: #00ff00")

  // Get a test route
  const testStart = { lat: 59.3293, lng: 18.0686 } // Stureplan area
  const testEnd = { lat: 59.3315, lng: 18.0720 } // Nearby

  console.log("\n%cTest Route:", "color: #ffff00; font-weight: bold")
  console.log("Start:", testStart)
  console.log("End:", testEnd)

  // Test pathfinding
  const { calculateDispatchRoute } = await import("@/lib/integrated-traffic-bridge")
  const roadRoute = calculateDispatchRoute(testStart, testEnd, false)

  console.log(
    "\n%cRoad-Based Pathfinding Result:",
    "color: #00ffff; font-weight: bold",
  )
  console.log("Waypoints:", roadRoute.length)
  console.log("First point:", roadRoute[0])
  console.log("Last point:", roadRoute[roadRoute.length - 1])

  if (roadRoute.length === 2) {
    console.warn(
      "%c⚠ Only 2 waypoints (straight line possible)",
      "color: #ff6600",
    )
  } else if (roadRoute.length > 10) {
    console.log("%c✓ Multiple waypoints - likely following roads", "color: #00ff00")
  }

  // Check road network
  const roadGraph = traffic.getRoadGraph()
  const allNodes = roadGraph.getAllNodes()
  const allEdges = roadGraph.getAllEdges()

  console.log("\n%cRoad Network Stats:", "color: #ffff00; font-weight: bold")
  console.log("Nodes (intersections):", allNodes.length)
  console.log("Edges (road segments):", allEdges.length)

  if (allNodes.length < 5) {
    console.warn(
      "%c⚠ Very few nodes in road network",
      "color: #ff6600",
    )
    console.log("This is likely the issue - the road network is too sparse.")
  }

  // Check NPC traffic
  const { getNPCVehicles } = await import("@/lib/integrated-traffic-bridge")
  const npcVehicles = getNPCVehicles()

  console.log(
    "\n%cNPC Traffic:",
    "color: #ffff00; font-weight: bold",
  )
  console.log("Vehicles in viewport:", npcVehicles.length)
  if (npcVehicles.length === 0) {
    console.warn(
      "%c⚠ No NPC vehicles spawned",
      "color: #ff6600",
    )
    console.log("Check that:")
    console.log("  1. Map zoom level >= 15")
    console.log("  2. Traffic system is updating each frame")
    console.log("  3. Viewport bounds are set correctly")
  }

  // Traffic stats
  const { getTrafficStats } = await import("@/lib/integrated-traffic-bridge")
  const stats = getTrafficStats()

  console.log(
    "\n%cTraffic System Stats:",
    "color: #ffff00; font-weight: bold",
  )
  console.log("Total vehicles:", stats?.totalVehicles)
  console.log("Vehicles in viewport:", stats?.vehiclesInViewport)
  console.log("Average speed:", stats?.averageSpeed.toFixed(4))
  console.log("Congestion level:", (stats?.congestionLevel || 0).toFixed(2))
  console.log("Update time (ms):", stats?.updateTimeMs.toFixed(2))

  console.log(
    "\n%c=== END DIAGNOSTICS ===",
    "color: #00ff00; font-weight: bold; font-size: 14px",
  )
}

/**
 * Compare road route vs straight line
 */
export function analyzeRouteType(routePoints: Array<{ lat: number; lng: number }>) {
  if (routePoints.length < 2) return "INVALID"

  // Calculate total distance traveled
  let totalDist = 0
  for (let i = 1; i < routePoints.length; i++) {
    const p1 = routePoints[i - 1]
    const p2 = routePoints[i]
    const dLat = p2.lat - p1.lat
    const dLng = p2.lng - p1.lng
    totalDist += Math.sqrt(dLat * dLat + dLng * dLng)
  }

  // Calculate straight-line distance
  const p1 = routePoints[0]
  const p2 = routePoints[routePoints.length - 1]
  const dLat = p2.lat - p1.lat
  const dLng = p2.lng - p1.lng
  const straightDist = Math.sqrt(dLat * dLat + dLng * dLng)

  const ratio = totalDist / straightDist

  console.log("Route Analysis:")
  console.log(`  Total distance: ${totalDist.toFixed(6)}`)
  console.log(`  Straight distance: ${straightDist.toFixed(6)}`)
  console.log(`  Ratio: ${ratio.toFixed(2)}x`)

  if (ratio < 1.05) {
    console.warn("⚠ Nearly straight line - likely not following roads")
    return "STRAIGHT_LINE"
  } else if (ratio < 1.2) {
    return "MOSTLY_STRAIGHT"
  } else {
    console.log("✓ Following non-straight path - likely roads")
    return "CURVED_PATH"
  }
}

/**
 * List all road nodes in network
 */
export async function listRoadNetwork() {
  const { getTrafficSystem } = await import("@/lib/integrated-traffic-bridge")
  const traffic = getTrafficSystem()

  if (!traffic) {
    console.log("Traffic system not initialized")
    return
  }

  const roadGraph = traffic.getRoadGraph()
  const nodes = roadGraph.getAllNodes()

  console.table(
    nodes.map((n) => ({
      ID: n.id,
      Lat: n.position.lat.toFixed(6),
      Lng: n.position.lng.toFixed(6),
      Type: n.type,
    })),
  )
}

/**
 * Export to window for easy console access
 */
if (typeof window !== "undefined") {
  ;(window as any).diagnosticsPathfinding = {
    diagnose: diagnosePathfinding,
    analyzeRoute: analyzeRouteType,
    listNetwork: listRoadNetwork,
  }
  console.log(
    "Pathfinding diagnostics available: window.diagnosticsPathfinding.diagnose()",
  )
}
