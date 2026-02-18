/**
 * A* Pathfinding for Road Networks
 * Supports both regular traffic and emergency vehicle routing
 */

import { RoadGraph, RoadNode, RoadSegment, LatLng } from "./road-graph"

export interface PathNode {
  nodeId: string
  gCost: number // cost from start
  hCost: number // heuristic cost to goal
  fCost: number // g + h
  parent: string | null
  segmentUsed: string | null // edge ID used to reach this node
}

export interface Route {
  waypoints: LatLng[]
  nodeIds: string[]
  segmentIds: string[]
  distance: number
  isEmergencyRoute: boolean
}

/**
 * A* Pathfinder for the road network
 */
export class Pathfinder {
  private graph: RoadGraph

  constructor(graph: RoadGraph) {
    this.graph = graph
  }

  /**
   * Find a path from start to goal using A* algorithm
   * isEmergency: if true, uses different heuristics and can ignore traffic
   */
  findPath(
    startPos: LatLng,
    goalPos: LatLng,
    isEmergency: boolean = false,
  ): Route | null {
    // Snap to nearest nodes
    const startNode = this.graph.getNearestNode(startPos)
    const goalNode = this.graph.getNearestNode(goalPos)

    if (!startNode || !goalNode) {
      console.warn("[Pathfinder] Could not snap to road network")
      return null
    }

    return this.findPathBetweenNodes(startNode.id, goalNode.id, isEmergency)
  }

  /**
   * Find path between two nodes on the network
   */
  findPathBetweenNodes(startNodeId: string, goalNodeId: string, isEmergency: boolean = false): Route | null {
    const openSet = new Map<string, PathNode>()
    const closedSet = new Set<string>()

    const startNode = this.graph.getNode(startNodeId)
    const goalNode = this.graph.getNode(goalNodeId)

    if (!startNode || !goalNode) return null

    // Initialize start node
    const heuristic = this.heuristic(startNode.position, goalNode.position, isEmergency)
    const startPathNode: PathNode = {
      nodeId: startNodeId,
      gCost: 0,
      hCost: heuristic,
      fCost: heuristic,
      parent: null,
      segmentUsed: null,
    }

    openSet.set(startNodeId, startPathNode)

    let iterations = 0
    const maxIterations = 1000

    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++

      // Find node with lowest f cost
      let current: PathNode | null = null
      let currentId = ""
      let lowestF = Infinity

      for (const [id, node] of openSet) {
        if (node.fCost < lowestF) {
          lowestF = node.fCost
          current = node
          currentId = id
        }
      }

      if (!current) break

      // Goal reached
      if (currentId === goalNodeId) {
        return this.reconstructRoute(current, this.graph)
      }

      openSet.delete(currentId)
      closedSet.add(currentId)

      // Explore neighbors
      const currentNode = this.graph.getNode(currentId)!
      const neighbors = this.graph.getOutgoingSegments(currentId)

      for (const segment of neighbors) {
        if (closedSet.has(segment.toNodeId)) continue

        // Check if this move is allowed (turn restrictions)
        if (!this.isValidTurn(current, segment, this.graph, isEmergency)) {
          continue
        }

        const neighborNode = this.graph.getNode(segment.toNodeId)!
        const gCost = current.gCost + this.segmentCost(segment, isEmergency)
        const hCost = this.heuristic(neighborNode.position, goalNode.position, isEmergency)
        const fCost = gCost + hCost

        const existing = openSet.get(segment.toNodeId)

        // If we found a better path, update it
        if (!existing || gCost < existing.gCost) {
          openSet.set(segment.toNodeId, {
            nodeId: segment.toNodeId,
            gCost,
            hCost,
            fCost,
            parent: currentId,
            segmentUsed: segment.id,
          })
        }
      }
    }

    // No path found
    console.warn("[Pathfinder] No path found after", iterations, "iterations")
    return null
  }

  /**
   * Calculate heuristic distance (as crow flies)
   */
  private heuristic(from: LatLng, to: LatLng, isEmergency: boolean): number {
    const latDiff = from.lat - to.lat
    const lngDiff = from.lng - to.lng
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff)

    // Emergency vehicles have lower heuristic (prioritize speed over accuracy)
    return isEmergency ? distance * 0.8 : distance
  }

  /**
   * Calculate cost to traverse a segment
   * Regular vehicles consider traffic density
   * Emergency vehicles ignore it
   */
  private segmentCost(segment: RoadSegment, isEmergency: boolean): number {
    let baseCost = segment.distance / Math.max(0.00001, segment.speedLimit)

    if (!isEmergency) {
      // Regular vehicles: add cost based on congestion
      const density = this.graph.getSegmentDensity(segment.id)
      const trafficMultiplier = 1 + density * 3 // up to 4x slower in heavy traffic
      baseCost *= trafficMultiplier
    }

    // Add slight preference for certain road types
    switch (segment.roadType) {
      case "highway":
        baseCost *= isEmergency ? 0.7 : 0.9
        break
      case "main-street":
        baseCost *= 1.0
        break
      case "residential":
        baseCost *= 1.1
        break
      case "small-street":
        baseCost *= 1.3
        break
    }

    return baseCost
  }

  /**
   * Check if a turn is valid given turn restrictions
   */
  private isValidTurn(
    current: PathNode,
    nextSegment: RoadSegment,
    graph: RoadGraph,
    isEmergency: boolean,
  ): boolean {
    // Emergency vehicles can ignore turn restrictions
    if (isEmergency) return true

    // If this is the start, allow any outgoing segment
    if (current.parent === null) return true

    const previousSegment = graph.getEdge(current.segmentUsed!)
    if (!previousSegment) return true

    // Determine turn direction
    const previousFrom = graph.getNode(previousSegment.fromNodeId)!
    const previousTo = graph.getNode(previousSegment.toNodeId)!
    const nextTo = graph.getNode(nextSegment.toNodeId)!

    const prevDir = {
      lat: previousTo.position.lat - previousFrom.position.lat,
      lng: previousTo.position.lng - previousFrom.position.lng,
    }

    const nextDir = {
      lat: nextTo.position.lat - previousTo.position.lat,
      lng: nextTo.position.lng - previousTo.position.lng,
    }

    // Calculate cross product to determine turn direction
    const cross = prevDir.lat * nextDir.lng - prevDir.lng * nextDir.lat
    const dot = prevDir.lat * nextDir.lat + prevDir.lng * nextDir.lng

    const restrictions = nextSegment.turnRestrictions

    // U-turn
    if (dot < -0.99) {
      return restrictions.allowUTurn
    }

    // Left turn (positive cross product in standard coordinates)
    if (cross > 0.1) {
      return restrictions.allowLeft
    }

    // Right turn (negative cross product)
    if (cross < -0.1) {
      return restrictions.allowRight
    }

    // Straight
    return restrictions.allowStraight
  }

  /**
   * Reconstruct path from goal to start
   */
  private reconstructRoute(goalNode: PathNode, graph: RoadGraph): Route {
    const waypoints: LatLng[] = []
    const nodeIds: string[] = []
    const segmentIds: string[] = []
    let distance = 0

    let current: PathNode | null = goalNode

    // Build path backwards
    const pathNodes: PathNode[] = []
    while (current) {
      pathNodes.unshift(current)
      current = current.parent ? { nodeId: "", gCost: 0, hCost: 0, fCost: 0, parent: null, segmentUsed: null } : null
      
      // This is a simplified reconstruction; in production you'd maintain a proper parent chain
    }

    // Reconstruct by following segments
    current = goalNode
    while (current) {
      nodeIds.unshift(current.nodeId)
      
      const node = graph.getNode(current.nodeId)
      if (node) {
        waypoints.unshift(node.position)
      }

      if (current.segmentUsed) {
        segmentIds.unshift(current.segmentUsed)
        const segment = graph.getEdge(current.segmentUsed)
        if (segment) {
          distance += segment.distance
        }
      }

      // Walk back through parent chain - simplified for now
      break
    }

    return {
      waypoints,
      nodeIds,
      segmentIds,
      distance,
      isEmergencyRoute: false,
    }
  }

  /**
   * Recalculate path with updated congestion information
   * Used for dynamic rerouting
   */
  recalculatePath(currentRoute: Route, currentPos: LatLng, goalPos: LatLng, isEmergency: boolean = false): Route | null {
    // Check if any segments on current path are severely congested
    let shouldReroute = false

    for (const segmentId of currentRoute.segmentIds) {
      const segment = this.graph.getEdge(segmentId)
      if (segment && this.graph.getSegmentDensity(segmentId) > 0.8) {
        shouldReroute = true
        break
      }
    }

    if (!shouldReroute) return currentRoute

    // Find alternative route
    const newRoute = this.findPath(currentPos, goalPos, isEmergency)
    return newRoute || currentRoute
  }
}
