/**
 * Road Network Graph
 * Represents intersections and road segments for NPC pathfinding.
 * Nodes are intersections, edges are road segments with traffic properties.
 */

export interface LatLng {
  lat: number
  lng: number
}

export enum RoadType {
  HIGHWAY = "highway",
  MAIN_STREET = "main-street",
  RESIDENTIAL = "residential",
  SMALL_STREET = "small-street",
}

export enum IntersectionType {
  FOUR_WAY = "four-way",
  THREE_WAY = "three-way",
  ROUNDABOUT = "roundabout",
  TRAFFIC_LIGHT = "traffic-light",
  STOP_SIGN = "stop-sign",
}

/**
 * Turn restrictions at intersections
 * Prevents unrealistic turns like U-turns on highways
 */
export interface TurnRestrictions {
  allowLeft: boolean
  allowRight: boolean
  allowStraight: boolean
  allowUTurn: boolean
}

/**
 * Road segment connecting two intersections
 */
export interface RoadSegment {
  id: string
  fromNodeId: string
  toNodeId: string
  distance: number // in lat/lng units (approximately 111km per degree)
  roadType: RoadType
  speedLimit: number // in lat/lng units per second
  lanes: number
  occupancy: number // vehicles currently on this segment
  maxCapacity: number
  turnRestrictions: TurnRestrictions
}

/**
 * Intersection node in the road network
 */
export interface RoadNode {
  id: string
  position: LatLng
  type: IntersectionType
  incomingEdges: string[] // segment IDs
  outgoingEdges: string[] // segment IDs
  trafficLightId?: string // reference to traffic light if one exists
}

/**
 * Road Network Graph
 * Manages the complete network of intersections and roads
 */
export class RoadGraph {
  private nodes: Map<string, RoadNode> = new Map()
  private edges: Map<string, RoadSegment> = new Map()
  private nodesByPosition: Map<string, string> = new Map() // position key -> node id

  /**
   * Add an intersection node to the graph
   */
  addNode(node: RoadNode): void {
    this.nodes.set(node.id, node)
    const posKey = this.positionKey(node.position)
    this.nodesByPosition.set(posKey, node.id)
  }

  /**
   * Add a road segment connecting two intersections
   */
  addEdge(segment: RoadSegment): void {
    this.edges.set(segment.id, segment)
    
    const fromNode = this.nodes.get(segment.fromNodeId)
    const toNode = this.nodes.get(segment.toNodeId)
    
    if (fromNode && toNode) {
      if (!fromNode.outgoingEdges.includes(segment.id)) {
        fromNode.outgoingEdges.push(segment.id)
      }
      if (!toNode.incomingEdges.includes(segment.id)) {
        toNode.incomingEdges.push(segment.id)
      }
    }
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): RoadNode | undefined {
    return this.nodes.get(id)
  }

  /**
   * Get an edge by ID
   */
  getEdge(id: string): RoadSegment | undefined {
    return this.edges.get(id)
  }

  /**
   * Get nearest node to a position
   */
  getNearestNode(position: LatLng, maxDistance: number = 0.01): RoadNode | undefined {
    let nearest: RoadNode | undefined
    let nearestDist = maxDistance

    for (const node of this.nodes.values()) {
      const dist = this.distance(position, node.position)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = node
      }
    }

    return nearest
  }

  /**
   * Get all outgoing segments from a node
   */
  getOutgoingSegments(nodeId: string): RoadSegment[] {
    const node = this.nodes.get(nodeId)
    if (!node) return []
    return node.outgoingEdges
      .map(id => this.edges.get(id))
      .filter((e): e is RoadSegment => e !== undefined)
  }

  /**
   * Get all incoming segments to a node
   */
  getIncomingSegments(nodeId: string): RoadSegment[] {
    const node = this.nodes.get(nodeId)
    if (!node) return []
    return node.incomingEdges
      .map(id => this.edges.get(id))
      .filter((e): e is RoadSegment => e !== undefined)
  }

  /**
   * Get all nodes
   */
  getAllNodes(): RoadNode[] {
    return Array.from(this.nodes.values())
  }

  /**
   * Get all edges
   */
  getAllEdges(): RoadSegment[] {
    return Array.from(this.edges.values())
  }

  /**
   * Calculate distance between two positions using Haversine formula
   */
  private distance(p1: LatLng, p2: LatLng): number {
    const R = 6371 // Earth radius in km
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  /**
   * Create a position key for spatial lookup
   */
  private positionKey(pos: LatLng): string {
    return `${Math.round(pos.lat * 10000)},${Math.round(pos.lng * 10000)}`
  }

  /**
   * Update segment occupancy
   */
  updateSegmentOccupancy(segmentId: string, vehicleCount: number): void {
    const segment = this.edges.get(segmentId)
    if (segment) {
      segment.occupancy = vehicleCount
    }
  }

  /**
   * Get traffic density on a segment (0-1)
   */
  getSegmentDensity(segmentId: string): number {
    const segment = this.edges.get(segmentId)
    if (!segment || segment.maxCapacity === 0) return 0
    return Math.min(1, segment.occupancy / segment.maxCapacity)
  }
}

/**
 * Build a sample road network for testing
 * In production, this would be generated from OSM data
 */
export function createSampleRoadNetwork(): RoadGraph {
  const graph = new RoadGraph()

  // Create a grid of intersections for the test city
  const nodes: Map<string, RoadNode> = new Map()
  const gridSize = 5 // 5x5 grid of intersections
  const spacing = 0.005 // approximately 500m apart

  // Create grid nodes
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const nodeId = `node_${i}_${j}`
      const node: RoadNode = {
        id: nodeId,
        position: {
          lat: 59.915 + i * spacing,
          lng: 10.748 + j * spacing,
        },
        type: IntersectionType.TRAFFIC_LIGHT,
        incomingEdges: [],
        outgoingEdges: [],
      }
      nodes.set(nodeId, node)
      graph.addNode(node)
    }
  }

  // Create edges connecting the grid horizontally and vertically
  let edgeId = 0
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const currentId = `node_${i}_${j}`
      const current = nodes.get(currentId)!

      // Connect to the right (east)
      if (j < gridSize - 1) {
        const rightId = `node_${i}_${j + 1}`
        const right = nodes.get(rightId)!
        const dist = Math.sqrt(
          Math.pow(right.position.lat - current.position.lat, 2) +
            Math.pow(right.position.lng - current.position.lng, 2),
        )

        const segment: RoadSegment = {
          id: `edge_${edgeId++}`,
          fromNodeId: currentId,
          toNodeId: rightId,
          distance: dist,
          roadType: j === 0 || j === gridSize - 2 ? RoadType.MAIN_STREET : RoadType.RESIDENTIAL,
          speedLimit: 0.00005,
          lanes: j === 0 || j === gridSize - 2 ? 3 : 2,
          occupancy: 0,
          maxCapacity: j === 0 || j === gridSize - 2 ? 6 : 4,
          turnRestrictions: {
            allowLeft: true,
            allowRight: true,
            allowStraight: true,
            allowUTurn: false,
          },
        }
        graph.addEdge(segment)

        // Add reverse direction for bidirectional roads
        const reverseSegment: RoadSegment = {
          id: `edge_${edgeId++}`,
          fromNodeId: rightId,
          toNodeId: currentId,
          distance: dist,
          roadType: segment.roadType,
          speedLimit: segment.speedLimit,
          lanes: segment.lanes,
          occupancy: 0,
          maxCapacity: segment.maxCapacity,
          turnRestrictions: segment.turnRestrictions,
        }
        graph.addEdge(reverseSegment)
      }

      // Connect down (south)
      if (i < gridSize - 1) {
        const downId = `node_${i + 1}_${j}`
        const down = nodes.get(downId)!
        const dist = Math.sqrt(
          Math.pow(down.position.lat - current.position.lat, 2) +
            Math.pow(down.position.lng - current.position.lng, 2),
        )

        const segment: RoadSegment = {
          id: `edge_${edgeId++}`,
          fromNodeId: currentId,
          toNodeId: downId,
          distance: dist,
          roadType: i === 0 || i === gridSize - 2 ? RoadType.MAIN_STREET : RoadType.RESIDENTIAL,
          speedLimit: 0.00005,
          lanes: i === 0 || i === gridSize - 2 ? 3 : 2,
          occupancy: 0,
          maxCapacity: i === 0 || i === gridSize - 2 ? 6 : 4,
          turnRestrictions: {
            allowLeft: true,
            allowRight: true,
            allowStraight: true,
            allowUTurn: false,
          },
        }
        graph.addEdge(segment)

        // Add reverse direction
        const reverseSegment: RoadSegment = {
          id: `edge_${edgeId++}`,
          fromNodeId: downId,
          toNodeId: currentId,
          distance: dist,
          roadType: segment.roadType,
          speedLimit: segment.speedLimit,
          lanes: segment.lanes,
          occupancy: 0,
          maxCapacity: segment.maxCapacity,
          turnRestrictions: segment.turnRestrictions,
        }
        graph.addEdge(reverseSegment)
      }
    }
  }

  return graph
}
