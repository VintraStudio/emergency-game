/**
 * Road Network Analyzer - Snaps positions to nearest road and provides
 * street-aware routing fallback when OSRM is unavailable
 */

import type { LatLng } from "./game-types"

/**
 * Simple road grid for Stockholm city area
 * These are approximate major roads/streets in the city
 */
const STOCKHOLM_ROADS: Array<{ name: string; points: LatLng[] }> = [
  // Main north-south arteries
  {
    name: "Hornsgatan",
    points: [
      { lat: 59.32, lng: 18.05 },
      { lat: 59.33, lng: 18.05 },
      { lat: 59.34, lng: 18.05 },
      { lat: 59.35, lng: 18.05 },
    ],
  },
  {
    name: "Sveavägen",
    points: [
      { lat: 59.31, lng: 18.07 },
      { lat: 59.32, lng: 18.07 },
      { lat: 59.33, lng: 18.07 },
      { lat: 59.34, lng: 18.07 },
      { lat: 59.35, lng: 18.07 },
    ],
  },
  {
    name: "Birger Jarlsgatan",
    points: [
      { lat: 59.33, lng: 18.05 },
      { lat: 59.33, lng: 18.065 },
      { lat: 59.33, lng: 18.08 },
      { lat: 59.33, lng: 18.095 },
    ],
  },
  // East-west arteries
  {
    name: "Strandvägen",
    points: [
      { lat: 59.335, lng: 18.08 },
      { lat: 59.335, lng: 18.09 },
      { lat: 59.335, lng: 18.1 },
    ],
  },
  {
    name: "Valhallavägen",
    points: [
      { lat: 59.34, lng: 18.08 },
      { lat: 59.34, lng: 18.09 },
      { lat: 59.34, lng: 18.1 },
    ],
  },
]

/**
 * Find nearest point on any road
 */
export function snapToNearestRoad(pos: LatLng, maxDistance = 0.005): LatLng {
  let nearest: LatLng = pos
  let minDist = Infinity

  for (const road of STOCKHOLM_ROADS) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const p1 = road.points[i]
      const p2 = road.points[i + 1]

      // Find closest point on line segment p1-p2
      const closest = closestPointOnSegment(pos, p1, p2)
      const dist = distance(pos, closest)

      if (dist < minDist && dist <= maxDistance) {
        minDist = dist
        nearest = closest
      }
    }
  }

  return nearest
}

/**
 * Find closest point on line segment
 */
function closestPointOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const dx = b.lng - a.lng
  const dy = b.lat - a.lat
  const len2 = dx * dx + dy * dy

  if (len2 === 0) return a

  let t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2
  t = Math.max(0, Math.min(1, t))

  return {
    lat: a.lat + t * dy,
    lng: a.lng + t * dx,
  }
}

/**
 * Distance between two points (lat/lng)
 */
function distance(a: LatLng, b: LatLng): number {
  const dlat = b.lat - a.lat
  const dlng = b.lng - a.lng
  return Math.sqrt(dlat * dlat + dlng * dlng)
}

/**
 * Generate street-aware fallback route by snapping to roads
 */
export function streetAwareRoute(from: LatLng, to: LatLng): LatLng[] {
  // Try to snap both endpoints to nearest roads
  const snapFrom = snapToNearestRoad(from)
  const snapTo = snapToNearestRoad(to)

  // Generate route between snapped points
  const points: LatLng[] = []
  const steps = 32

  // Add initial point
  points.push(from)

  // Interpolate through snapped points (simple linear for now)
  // In a full implementation, this would follow actual road paths
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    points.push({
      lat: from.lat + t * (to.lat - from.lat),
      lng: from.lng + t * (to.lng - from.lng),
    })
  }

  // Add final point
  points.push(to)

  // Post-process: snap waypoints near roads to actual roads
  return points.map((p, idx) => {
    // Keep start and end points as-is, snap middle points
    if (idx === 0 || idx === points.length - 1) return p
    return snapToNearestRoad(p, 0.01) // More generous snap distance for mid-points
  })
}

/**
 * Check if position is close to any road
 */
export function isNearRoad(pos: LatLng, threshold = 0.003): boolean {
  return snapToNearestRoad(pos, threshold) !== pos
}

/**
 * Get all roads in a bounding box (for rendering/debugging)
 */
export function getRoadsInBounds(
  bounds: { north: number; south: number; east: number; west: number },
): Array<{ name: string; points: LatLng[] }> {
  return STOCKHOLM_ROADS.filter((road) =>
    road.points.some(
      (p) => p.lat <= bounds.north && p.lat >= bounds.south && p.lng <= bounds.east && p.lng >= bounds.west,
    ),
  )
}
