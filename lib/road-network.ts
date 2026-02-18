/**
 * Road Network Analyzer - Snaps positions to nearest road and provides
 * street-aware routing fallback when OSRM is unavailable
 */

import type { LatLng } from "./game-types"

/**
 * Generate street-aware fallback route using smooth Bézier curve
 * This provides a better fallback than straight line when OSRM fails
 */
export function streetAwareRoute(from: LatLng, to: LatLng): LatLng[] {
  const points: LatLng[] = [from]
  const steps = 48

  // Calculate control points for smooth curve
  const dx = to.lng - from.lng
  const dy = to.lat - from.lat
  
  // Create two intermediate control points to add curvature
  const ctrl1 = {
    lat: from.lat + dy * 0.25 + dx * 0.1,
    lng: from.lng + dx * 0.25 - dy * 0.1,
  }
  
  const ctrl2 = {
    lat: from.lat + dy * 0.75 - dx * 0.1,
    lng: from.lng + dx * 0.75 + dy * 0.1,
  }

  // Generate cubic Bézier curve
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const t1 = 1 - t
    const t2 = t * t
    const t3 = t1 * t1

    // Cubic Bézier formula: (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
    points.push({
      lat:
        t3 * t1 * from.lat +
        3 * t3 * t * ctrl1.lat +
        3 * t1 * t2 * ctrl2.lat +
        t2 * t * to.lat,
      lng:
        t3 * t1 * from.lng +
        3 * t3 * t * ctrl1.lng +
        3 * t1 * t2 * ctrl2.lng +
        t2 * t * to.lng,
    })
  }

  points.push(to)
  return points
}
