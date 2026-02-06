import type { Position, RoadNode } from "./game-types"

// --- EXPANDED ROAD NETWORK (1600 x 1000 map) ---
// Nodes are intersections; edges connect along roads

export const ROAD_NODES: RoadNode[] = [
  // === Top highway (horizontal, y~40) ===
  { id: "hw-t1", x: 0, y: 40, connections: ["hw-t2"] },
  { id: "hw-t2", x: 200, y: 40, connections: ["hw-t1", "hw-t3", "n-a1"] },
  { id: "hw-t3", x: 500, y: 40, connections: ["hw-t2", "hw-t4", "n-b1"] },
  { id: "hw-t4", x: 800, y: 40, connections: ["hw-t3", "hw-t5", "n-c1"] },
  { id: "hw-t5", x: 1100, y: 40, connections: ["hw-t4", "hw-t6", "n-d1"] },
  { id: "hw-t6", x: 1400, y: 40, connections: ["hw-t5", "hw-t7"] },
  { id: "hw-t7", x: 1600, y: 40, connections: ["hw-t6"] },

  // === Bottom highway (horizontal, y~960) ===
  { id: "hw-b1", x: 0, y: 960, connections: ["hw-b2"] },
  { id: "hw-b2", x: 200, y: 960, connections: ["hw-b1", "hw-b3", "n-a6"] },
  { id: "hw-b3", x: 500, y: 960, connections: ["hw-b2", "hw-b4", "n-b6"] },
  { id: "hw-b4", x: 800, y: 960, connections: ["hw-b3", "hw-b5", "n-c6"] },
  { id: "hw-b5", x: 1100, y: 960, connections: ["hw-b4", "hw-b6", "n-d6"] },
  { id: "hw-b6", x: 1400, y: 960, connections: ["hw-b5", "hw-b7"] },
  { id: "hw-b7", x: 1600, y: 960, connections: ["hw-b6"] },

  // === Left highway (vertical, x~40) ===
  { id: "hw-l1", x: 40, y: 0, connections: ["hw-l2"] },
  { id: "hw-l2", x: 40, y: 150, connections: ["hw-l1", "hw-l3", "n-a1"] },
  { id: "hw-l3", x: 40, y: 350, connections: ["hw-l2", "hw-l4", "n-a3"] },
  { id: "hw-l4", x: 40, y: 550, connections: ["hw-l3", "hw-l5", "n-a4"] },
  { id: "hw-l5", x: 40, y: 750, connections: ["hw-l4", "hw-l6", "n-a5"] },
  { id: "hw-l6", x: 40, y: 960, connections: ["hw-l5"] },

  // === Right highway (vertical, x~1560) ===
  { id: "hw-r1", x: 1560, y: 0, connections: ["hw-r2"] },
  { id: "hw-r2", x: 1560, y: 150, connections: ["hw-r1", "hw-r3", "n-d1"] },
  { id: "hw-r3", x: 1560, y: 350, connections: ["hw-r2", "hw-r4", "n-d3"] },
  { id: "hw-r4", x: 1560, y: 550, connections: ["hw-r3", "hw-r5", "n-d4"] },
  { id: "hw-r5", x: 1560, y: 750, connections: ["hw-r4", "hw-r6", "n-d5"] },
  { id: "hw-r6", x: 1560, y: 960, connections: ["hw-r5"] },

  // === Column A (x~200) ===
  { id: "n-a1", x: 200, y: 150, connections: ["hw-t2", "hw-l2", "n-a2", "n-b1"] },
  { id: "n-a2", x: 200, y: 250, connections: ["n-a1", "n-a3", "n-b2"] },
  { id: "n-a3", x: 200, y: 350, connections: ["n-a2", "n-a4", "hw-l3", "n-b3"] },
  { id: "n-a4", x: 200, y: 550, connections: ["n-a3", "n-a5", "hw-l4", "n-b4"] },
  { id: "n-a5", x: 200, y: 750, connections: ["n-a4", "n-a6", "hw-l5", "n-b5"] },
  { id: "n-a6", x: 200, y: 880, connections: ["n-a5", "hw-b2", "n-b6"] },

  // === Column B (x~500) ===
  { id: "n-b1", x: 500, y: 150, connections: ["hw-t3", "n-a1", "n-b2", "n-c1"] },
  { id: "n-b2", x: 500, y: 250, connections: ["n-b1", "n-b3", "n-a2", "n-c2"] },
  { id: "n-b3", x: 500, y: 350, connections: ["n-b2", "n-b4", "n-a3", "n-c3"] },
  { id: "n-b4", x: 500, y: 550, connections: ["n-b3", "n-b5", "n-a4", "n-c4"] },
  { id: "n-b5", x: 500, y: 750, connections: ["n-b4", "n-b6", "n-a5", "n-c5"] },
  { id: "n-b6", x: 500, y: 880, connections: ["n-b5", "hw-b3", "n-a6", "n-c6"] },

  // === Column C (x~800) ===
  { id: "n-c1", x: 800, y: 150, connections: ["hw-t4", "n-b1", "n-c2", "n-d1"] },
  { id: "n-c2", x: 800, y: 250, connections: ["n-c1", "n-c3", "n-b2", "n-d2"] },
  { id: "n-c3", x: 800, y: 350, connections: ["n-c2", "n-c4", "n-b3", "n-d3"] },
  { id: "n-c4", x: 800, y: 550, connections: ["n-c3", "n-c5", "n-b4", "n-d4"] },
  { id: "n-c5", x: 800, y: 750, connections: ["n-c4", "n-c6", "n-b5", "n-d5"] },
  { id: "n-c6", x: 800, y: 880, connections: ["n-c5", "hw-b4", "n-b6", "n-d6"] },

  // === Column D (x~1100) ===
  { id: "n-d1", x: 1100, y: 150, connections: ["hw-t5", "n-c1", "n-d2", "hw-r2"] },
  { id: "n-d2", x: 1100, y: 250, connections: ["n-d1", "n-d3", "n-c2"] },
  { id: "n-d3", x: 1100, y: 350, connections: ["n-d2", "n-d4", "n-c3", "hw-r3"] },
  { id: "n-d4", x: 1100, y: 550, connections: ["n-d3", "n-d5", "n-c4", "hw-r4"] },
  { id: "n-d5", x: 1100, y: 750, connections: ["n-d4", "n-d6", "n-c5", "hw-r5"] },
  { id: "n-d6", x: 1100, y: 880, connections: ["n-d5", "hw-b5", "n-c6"] },

  // === Extra side streets for detail ===
  // Between A and B, mid-rows
  { id: "s-ab1", x: 350, y: 200, connections: ["n-a1", "n-b1", "s-ab2"] },
  { id: "s-ab2", x: 350, y: 300, connections: ["s-ab1", "n-a3", "n-b3"] },
  { id: "s-ab3", x: 350, y: 450, connections: ["n-a3", "n-b4", "s-ab4"] },
  { id: "s-ab4", x: 350, y: 650, connections: ["s-ab3", "n-a5", "n-b5"] },

  // Between B and C, mid-rows
  { id: "s-bc1", x: 650, y: 200, connections: ["n-b1", "n-c1", "s-bc2"] },
  { id: "s-bc2", x: 650, y: 300, connections: ["s-bc1", "n-b3", "n-c3"] },
  { id: "s-bc3", x: 650, y: 450, connections: ["n-b3", "n-c4", "s-bc4"] },
  { id: "s-bc4", x: 650, y: 650, connections: ["s-bc3", "n-b5", "n-c5"] },

  // Between C and D, mid-rows
  { id: "s-cd1", x: 950, y: 200, connections: ["n-c1", "n-d1", "s-cd2"] },
  { id: "s-cd2", x: 950, y: 300, connections: ["s-cd1", "n-c3", "n-d3"] },
  { id: "s-cd3", x: 950, y: 450, connections: ["n-c3", "n-d4", "s-cd4"] },
  { id: "s-cd4", x: 950, y: 650, connections: ["s-cd3", "n-c5", "n-d5"] },
]

// Build adjacency lookup
const nodeMap = new Map<string, RoadNode>()
for (const n of ROAD_NODES) nodeMap.set(n.id, n)

export function getNode(id: string): RoadNode | undefined {
  return nodeMap.get(id)
}

function dist(a: Position, b: Position) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

export function findNearestNode(pos: Position): string {
  let best = ROAD_NODES[0].id
  let bestDist = Infinity
  for (const n of ROAD_NODES) {
    const d = dist(pos, n)
    if (d < bestDist) {
      bestDist = d
      best = n.id
    }
  }
  return best
}

// A* pathfinding
export function findPath(fromNodeId: string, toNodeId: string): Position[] {
  const start = nodeMap.get(fromNodeId)
  const goal = nodeMap.get(toNodeId)
  if (!start || !goal) return []
  if (fromNodeId === toNodeId) return [{ x: goal.x, y: goal.y }]

  const openSet = new Set<string>([fromNodeId])
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>()
  const fScore = new Map<string, number>()

  gScore.set(fromNodeId, 0)
  fScore.set(fromNodeId, dist(start, goal))

  while (openSet.size > 0) {
    let current = ""
    let currentF = Infinity
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity
      if (f < currentF) {
        currentF = f
        current = id
      }
    }

    if (current === toNodeId) {
      // Reconstruct path
      const path: Position[] = []
      let node = current
      while (node) {
        const n = nodeMap.get(node)!
        path.unshift({ x: n.x, y: n.y })
        const prev = cameFrom.get(node)
        if (!prev) break
        node = prev
      }
      return path
    }

    openSet.delete(current)
    const currentNode = nodeMap.get(current)!

    for (const neighborId of currentNode.connections) {
      const neighbor = nodeMap.get(neighborId)
      if (!neighbor) continue

      const tentativeG = (gScore.get(current) ?? Infinity) + dist(currentNode, neighbor)
      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current)
        gScore.set(neighborId, tentativeG)
        fScore.set(neighborId, tentativeG + dist(neighbor, goal))
        openSet.add(neighborId)
      }
    }
  }

  // No path found, just return direct
  return [{ x: start.x, y: start.y }, { x: goal.x, y: goal.y }]
}

// Structures to draw the road lines on the map
export interface DrawableRoad {
  x1: number
  y1: number
  x2: number
  y2: number
  type: "highway" | "main" | "side"
}

export function getDrawableRoads(): DrawableRoad[] {
  const roads: DrawableRoad[] = []
  const seen = new Set<string>()

  for (const node of ROAD_NODES) {
    for (const connId of node.connections) {
      const key = [node.id, connId].sort().join("-")
      if (seen.has(key)) continue
      seen.add(key)

      const other = nodeMap.get(connId)
      if (!other) continue

      let type: DrawableRoad["type"] = "main"
      if (node.id.startsWith("hw-") && connId.startsWith("hw-")) {
        type = "highway"
      } else if (node.id.startsWith("s-") || connId.startsWith("s-")) {
        type = "side"
      }

      roads.push({
        x1: node.x, y1: node.y,
        x2: other.x, y2: other.y,
        type,
      })
    }
  }
  return roads
}
