/**
 * Integrated Pathing System Bridge
 * 
 * Bridges the dispatch unit system with the NPC traffic system to ensure
 * all vehicles follow the same road network and traffic rules.
 */

import { TrafficSystem } from "./traffic/traffic-system"
import { Pathfinder } from "./pathfinding/pathfinder"
import { createSampleRoadNetwork } from "./pathfinding/road-graph"
import type { LatLng } from "./game-types"

let trafficSystem: TrafficSystem | null = null
let pathfinder: Pathfinder | null = null

/**
 * Initialize the integrated traffic and pathfinding system
 */
export function initializeTrafficSystem(viewportBounds: {
  north: number
  south: number
  east: number
  west: number
}): TrafficSystem {
  if (trafficSystem) return trafficSystem

  const roadGraph = createSampleRoadNetwork()
  pathfinder = new Pathfinder(roadGraph)
  
  trafficSystem = new TrafficSystem(viewportBounds)
  console.log("[v0] Traffic system initialized with road network")
  
  return trafficSystem
}

/**
 * Get or create the traffic system
 */
export function getTrafficSystem(): TrafficSystem | null {
  return trafficSystem
}

/**
 * Calculate a road-following route for dispatch units
 * Falls back to straight path if pathfinding fails
 */
export function calculateDispatchRoute(
  from: LatLng,
  to: LatLng,
  isEmergency: boolean = false,
): LatLng[] {
  if (!pathfinder) {
    console.warn("[v0] Pathfinder not initialized, using fallback route")
    return generateFallbackRoute(from, to)
  }

  try {
    const route = pathfinder.findPath(from, to, isEmergency)
    if (route && route.waypoints.length > 0) {
      console.log("[v0] Found road-based route with", route.waypoints.length, "waypoints for", isEmergency ? "emergency" : "regular", "unit")
      return route.waypoints
    } else {
      console.warn("[v0] Pathfinder returned empty route, using fallback")
    }
  } catch (error) {
    console.warn("[v0] Pathfinding failed:", error)
  }

  // Fallback to Bezier curve if pathfinding fails
  return generateFallbackRoute(from, to)
}

/**
 * Generate a fallback Bezier curve route
 * Used when pathfinding is unavailable
 */
function generateFallbackRoute(from: LatLng, to: LatLng): LatLng[] {
  const steps = 24
  const points: LatLng[] = []

  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng

  // Mild deterministic curve
  const mid = { lat: from.lat + dLat * 0.5, lng: from.lng + dLng * 0.5 }
  const perpLen = Math.sqrt(dLat * dLat + dLng * dLng) || 0.001
  const perpLat = -dLng / perpLen
  const perpLng = dLat / perpLen
  const curve = perpLen * 0.015

  const control = {
    lat: mid.lat + perpLat * curve,
    lng: mid.lng + perpLng * curve,
  }

  // Quadratic Bezier
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = (1 - t) * (1 - t)
    const b = 2 * (1 - t) * t
    const c = t * t
    points.push({
      lat: a * from.lat + b * control.lat + c * to.lat,
      lng: a * from.lng + b * control.lng + c * to.lng,
    })
  }
  return points
}

/**
 * Update the traffic system (call from game loop)
 */
export function updateTrafficSystem(deltaTime: number): void {
  if (!trafficSystem) return
  trafficSystem.update(deltaTime)
}

/**
 * Get all NPC vehicles for rendering
 */
export function getNPCVehicles() {
  if (!trafficSystem) return []
  return trafficSystem.getViewportVehicles()
}

/**
 * Get traffic statistics for debugging
 */
export function getTrafficStats() {
  if (!trafficSystem) return null
  return trafficSystem.getStats()
}

/**
 * Update viewport bounds
 */
export function updateViewportBounds(bounds: {
  north: number
  south: number
  east: number
  west: number
}): void {
  if (trafficSystem) {
    trafficSystem.updateViewportBounds(bounds)
  }
}

/**
 * Set time scale for traffic simulation
 */
export function setTrafficTimeScale(scale: number): void {
  if (trafficSystem) {
    trafficSystem.setTimeScale(scale)
  }
}
