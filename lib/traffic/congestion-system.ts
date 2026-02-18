/**
 * Dynamic Rerouting and Congestion System
 * Handles traffic congestion detection, prediction, and dynamic route adjustments
 */

import { RoadGraph, RoadSegment, LatLng } from "../pathfinding/road-graph"
import { Pathfinder, Route } from "../pathfinding/pathfinder"
import { NPCVehicle } from "./vehicle-controller"

/**
 * Congestion state at a road segment
 */
export enum CongestionLevel {
  CLEAR = "clear", // 0-30% capacity
  MODERATE = "moderate", // 30-60% capacity
  HEAVY = "heavy", // 60-85% capacity
  GRIDLOCK = "gridlock", // 85-100% capacity
}

/**
 * Traffic incident that may block a road
 */
export interface TrafficIncident {
  id: string
  segmentId: string
  type: "accident" | "construction" | "hazard" | "congestion"
  severity: number // 0-1
  createdAt: number
  duration: number // estimated duration in ms
  affectedLanes: number // how many lanes are affected
}

/**
 * Congestion monitoring and prediction
 */
export class CongestionMonitor {
  private graph: RoadGraph
  private segmentHistory: Map<string, number[]> = new Map() // segment ID -> occupancy history
  private maxHistoryLength: number = 60 // frames to keep history
  private incidents: Map<string, TrafficIncident> = new Map()

  constructor(graph: RoadGraph) {
    this.graph = graph
  }

  /**
   * Update congestion data for all segments
   */
  updateCongestion(vehicles: NPCVehicle[]): void {
    const segmentOccupancy = new Map<string, number>()

    // Count vehicles per segment
    for (const vehicle of vehicles) {
      if (vehicle.route) {
        for (const segmentId of vehicle.route.segmentIds) {
          segmentOccupancy.set(segmentId, (segmentOccupancy.get(segmentId) || 0) + 1)
        }
      }
    }

    // Update history
    for (const [segmentId, count] of segmentOccupancy) {
      if (!this.segmentHistory.has(segmentId)) {
        this.segmentHistory.set(segmentId, [])
      }

      const history = this.segmentHistory.get(segmentId)!
      history.push(count)

      if (history.length > this.maxHistoryLength) {
        history.shift()
      }

      this.graph.updateSegmentOccupancy(segmentId, count)
    }
  }

  /**
   * Get congestion level for a segment
   */
  getCongestionLevel(segmentId: string): CongestionLevel {
    const density = this.graph.getSegmentDensity(segmentId)

    if (density < 0.3) return CongestionLevel.CLEAR
    if (density < 0.6) return CongestionLevel.MODERATE
    if (density < 0.85) return CongestionLevel.HEAVY
    return CongestionLevel.GRIDLOCK
  }

  /**
   * Predict future congestion on a route
   */
  predictCongestion(route: Route): number {
    let totalCongestion = 0

    for (const segmentId of route.segmentIds) {
      const level = this.getCongestionLevel(segmentId)
      const levelValue = this.congestionLevelToNumber(level)
      totalCongestion += levelValue
    }

    return route.segmentIds.length > 0 ? totalCongestion / route.segmentIds.length : 0
  }

  /**
   * Convert congestion level to numeric value
   */
  private congestionLevelToNumber(level: CongestionLevel): number {
    switch (level) {
      case CongestionLevel.CLEAR:
        return 0.1
      case CongestionLevel.MODERATE:
        return 0.45
      case CongestionLevel.HEAVY:
        return 0.725
      case CongestionLevel.GRIDLOCK:
        return 0.925
    }
  }

  /**
   * Add a traffic incident
   */
  addIncident(incident: TrafficIncident): void {
    this.incidents.set(incident.id, incident)
  }

  /**
   * Remove resolved incident
   */
  removeIncident(incidentId: string): void {
    this.incidents.delete(incidentId)
  }

  /**
   * Get incidents on a segment
   */
  getSegmentIncidents(segmentId: string): TrafficIncident[] {
    const now = Date.now()
    const incidents: TrafficIncident[] = []

    for (const incident of this.incidents.values()) {
      if (incident.segmentId === segmentId) {
        // Check if incident is still active
        if (now - incident.createdAt < incident.duration) {
          incidents.push(incident)
        } else {
          this.incidents.delete(incident.id)
        }
      }
    }

    return incidents
  }

  /**
   * Get average congestion across entire network
   */
  getNetworkCongestion(): number {
    const allSegments = this.graph.getAllEdges()
    let totalDensity = 0

    for (const segment of allSegments) {
      totalDensity += this.graph.getSegmentDensity(segment.id)
    }

    return allSegments.length > 0 ? totalDensity / allSegments.length : 0
  }

  /**
   * Get segments with incidents
   */
  getBlockedSegments(): RoadSegment[] {
    const blocked: RoadSegment[] = []
    const now = Date.now()

    for (const incident of this.incidents.values()) {
      if (now - incident.createdAt < incident.duration) {
        const segment = this.graph.getEdge(incident.segmentId)
        if (segment) {
          blocked.push(segment)
        }
      }
    }

    return blocked
  }
}

/**
 * Rerouting Decision Engine
 * Determines when and how to reroute vehicles
 */
export class ReroutingEngine {
  private pathfinder: Pathfinder
  private congestionMonitor: CongestionMonitor
  private rerouteThreshold: number = 0.7 // reroute if predicted congestion > 70%
  private lastRerouteTime: Map<string, number> = new Map() // vehicle ID -> last reroute time
  private minRerouteInterval: number = 5000 // min time between reroutes for same vehicle

  constructor(graph: RoadGraph, congestionMonitor: CongestionMonitor) {
    this.pathfinder = new Pathfinder(graph)
    this.congestionMonitor = congestionMonitor
  }

  /**
   * Evaluate if a vehicle should be rerouted
   */
  shouldReroute(vehicle: NPCVehicle): boolean {
    if (!vehicle.route) return false

    // Check if enough time has passed since last reroute
    const lastReroute = this.lastRerouteTime.get(vehicle.id) || 0
    if (Date.now() - lastReroute < this.minRerouteInterval) {
      return false
    }

    // Check if current route has heavy congestion
    const predictedCongestion = this.congestionMonitor.predictCongestion(vehicle.route)
    if (predictedCongestion > this.rerouteThreshold) {
      return true
    }

    // Check if ahead is gridlock
    const nextSegmentId = vehicle.route.segmentIds[Math.min(2, vehicle.route.segmentIds.length - 1)]
    if (nextSegmentId) {
      const level = this.congestionMonitor.getCongestionLevel(nextSegmentId)
      if (level === CongestionLevel.GRIDLOCK) {
        return true
      }
    }

    return false
  }

  /**
   * Calculate alternative route for a vehicle
   */
  calculateAlternativeRoute(
    vehicle: NPCVehicle,
    currentRoute: Route,
    isEmergency: boolean = false,
  ): Route | null {
    // Get destination (last waypoint of current route)
    if (currentRoute.waypoints.length === 0) return null

    const destination = currentRoute.waypoints[currentRoute.waypoints.length - 1]
    const currentPos = vehicle.position

    // Try to find alternative
    const newRoute = this.pathfinder.findPath(currentPos, destination, isEmergency)

    if (!newRoute) return null

    // Only use new route if it's significantly better
    const oldCongestion = this.congestionMonitor.predictCongestion(currentRoute)
    const newCongestion = this.congestionMonitor.predictCongestion(newRoute)

    // Must be at least 20% better or be significantly shorter
    if (newCongestion < oldCongestion * 0.8 || newRoute.distance < currentRoute.distance * 0.9) {
      this.lastRerouteTime.set(vehicle.id, Date.now())
      return newRoute
    }

    return null
  }

  /**
   * Handle stuck vehicle
   */
  handleStuckVehicle(vehicle: NPCVehicle): Route | null {
    if (!vehicle.route) return null

    // Try forced reroute
    const destination = vehicle.route.waypoints[vehicle.route.waypoints.length - 1]
    const newRoute = this.pathfinder.findPath(vehicle.position, destination, vehicle.isEmergency)

    if (newRoute) {
      this.lastRerouteTime.set(vehicle.id, Date.now())
      return newRoute
    }

    // If still stuck, try alternative destination (nearby intersection)
    const graph = (this.pathfinder as any).graph as RoadGraph
    const nearestNode = graph.getNearestNode(vehicle.position, 0.005)

    if (nearestNode) {
      const alternativeRoute = this.pathfinder.findPath(vehicle.position, nearestNode.position, vehicle.isEmergency)
      if (alternativeRoute) {
        this.lastRerouteTime.set(vehicle.id, Date.now())
        return alternativeRoute
      }
    }

    return null
  }

  /**
   * Set rerouting threshold
   */
  setRerouteThreshold(threshold: number): void {
    this.rerouteThreshold = Math.max(0, Math.min(1, threshold))
  }
}

/**
 * Adaptive Traffic Flow Management
 * Adjusts traffic light timing based on congestion patterns
 */
export class AdaptiveTrafficFlow {
  private congestionMonitor: CongestionMonitor
  private lastAdaptTime: number = Date.now()
  private adaptInterval: number = 30000 // Adjust every 30 seconds

  constructor(congestionMonitor: CongestionMonitor) {
    this.congestionMonitor = congestionMonitor
  }

  /**
   * Analyze traffic and suggest optimizations
   */
  analyzeFlow(): {
    overallCongestion: number
    criticalSegments: string[]
    recommendations: string[]
  } {
    const now = Date.now()
    const overallCongestion = this.congestionMonitor.getNetworkCongestion()

    // Find critical segments with high congestion
    const blockedSegments = this.congestionMonitor.getBlockedSegments()
    const criticalSegments = blockedSegments.map(s => s.id)

    // Generate recommendations
    const recommendations: string[] = []

    if (overallCongestion > 0.8) {
      recommendations.push("Network approaching gridlock - consider activating traffic management")
    } else if (overallCongestion > 0.6) {
      recommendations.push("Heavy traffic detected - consider dynamic signal timing")
    }

    if (criticalSegments.length > 3) {
      recommendations.push("Multiple blocked segments - consider alternative routes")
    }

    return {
      overallCongestion,
      criticalSegments,
      recommendations,
    }
  }

  /**
   * Check if it's time to adapt traffic flow
   */
  isTimeToAdapt(): boolean {
    return Date.now() - this.lastAdaptTime > this.adaptInterval
  }

  /**
   * Mark that adaptation occurred
   */
  markAdapted(): void {
    this.lastAdaptTime = Date.now()
  }
}
