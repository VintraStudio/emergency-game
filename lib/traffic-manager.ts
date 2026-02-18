/**
 * NPC Traffic Manager
 * Cars drive along real OSRM routes on the road network.
 * Features:
 *  - Tiny round dots (1.5-2.5px radius)
 *  - Slow, realistic speed matching road type
 *  - Seamless path refresh: pre-fetches next route before current one ends
 *  - Traffic light simulation at intersections (red/green cycles)
 *  - Following distance collision avoidance
 *  - 40+ cars visible in viewport at all times
 *
 * Routes are hidden from the player -- only unit routes are rendered.
 * This module is standalone (not in React state) to avoid re-renders.
 */

import { getRouteQueued } from "./route-service"
import { getCachedRoute } from "./route-cache"
import { streetAwareRoute } from "./road-network"

export interface TrafficCar {
  id: number
  lat: number
  lng: number
  routeCoords: { lat: number; lng: number }[]
  routeIndex: number
  speed: number
  heading: number
  color: string
  stoppedTicks: number
  active: boolean
  routePending: boolean
  // Pre-fetched next route for seamless continuation
  nextRoute: { lat: number; lng: number }[] | null
  nextRoutePending: boolean
}

// Realistic muted car colors
const CAR_COLORS = [
  "#c8ccd0", "#2a2a2a", "#e0e0e0", "#3b4252", "#1e3a5f",
  "#7a2020", "#2d5016", "#5c4033", "#8899aa", "#b22222",
  "#4a6274", "#f0ece4", "#6b7280", "#444d5a", "#8b6914",
  "#364f3b", "#556270", "#a0a0a0", "#2c3e50", "#d4c5a0",
]

const TARGET_CARS = 45
const MAX_PENDING_FETCHES = 4
const FOLLOWING_DISTANCE = 0.00015 // ~15m
// Traffic light: intersection stops cycle between 15-40 ticks (1.2-3.2s at 80ms render)
const RED_LIGHT_MIN = 15
const RED_LIGHT_MAX = 40

// Module state
let viewBounds = { north: 0, south: 0, east: 0, west: 0 }
let isActive = false
const cars: TrafficCar[] = []
let nextCarId = 0
let pendingFetches = 0

// ---- OSRM route fetching ----

async function fetchCarRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<{ lat: number; lng: number }[]> {
  try {
    // Try cached OSRM first
    const cachedRoute = await getCachedRoute(from, to)
    if (cachedRoute.length > 0) {
      return cachedRoute
    }
  } catch (error) {
    console.log("[v0] OSRM routing failed, using fallback")
  }

  // Fallback to street-aware smooth curve
  return streetAwareRoute(from, to)
}

// ---- Spawning helpers ----

/** Random point inside the viewport (with slight padding) */
function randomViewportPoint(): { lat: number; lng: number } {
  const pad = 0.001
  return {
    lat: viewBounds.south + pad + Math.random() * (viewBounds.north - viewBounds.south - pad * 2),
    lng: viewBounds.west + pad + Math.random() * (viewBounds.east - viewBounds.west - pad * 2),
  }
}

/** Random destination across/through the viewport */
function randomDestination(): { lat: number; lng: number } {
  // Pick a random point in a larger area around the viewport
  const latSpan = viewBounds.north - viewBounds.south
  const lngSpan = viewBounds.east - viewBounds.west
  const latCenter = (viewBounds.north + viewBounds.south) / 2
  const lngCenter = (viewBounds.east + viewBounds.west) / 2
  return {
    lat: latCenter + (Math.random() - 0.5) * latSpan * 1.4,
    lng: lngCenter + (Math.random() - 0.5) * lngSpan * 1.4,
  }
}

function createCarShell(): TrafficCar {
  const pos = randomViewportPoint()
  return {
    id: nextCarId++,
    lat: pos.lat,
    lng: pos.lng,
    routeCoords: [],
    routeIndex: 0,
    speed: 0.15 + Math.random() * 0.15, // Very slow: 0.15-0.30 points/tick
    heading: 0,
    color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    stoppedTicks: 0,
    active: true,
    routePending: true,
    nextRoute: null,
    nextRoutePending: false,
  }
}

async function assignRoute(car: TrafficCar) {
  pendingFetches++
  const dest = randomDestination()
  const route = await fetchCarRoute({ lat: car.lat, lng: car.lng }, dest)
  pendingFetches--

  if (route.length >= 3) {
    car.routeCoords = route
    car.routeIndex = 0
    car.lat = route[0].lat
    car.lng = route[0].lng
    car.heading = Math.atan2(route[1].lng - route[0].lng, route[1].lat - route[0].lat)
    car.routePending = false
  } else {
    // Failed -- kill the car, it will be replaced
    car.active = false
    car.routePending = false
  }
}

/** Pre-fetch a continuation route from the end of the current route */
async function prefetchNextRoute(car: TrafficCar) {
  if (car.nextRoutePending || car.nextRoute) return
  car.nextRoutePending = true
  pendingFetches++

  const endPt = car.routeCoords[car.routeCoords.length - 1]
  const dest = randomDestination()
  const route = await fetchCarRoute(endPt, dest)
  pendingFetches--
  car.nextRoutePending = false

  if (route.length >= 3) {
    car.nextRoute = route
  }
}

// ---- Movement helpers ----

function getAngleChange(coords: { lat: number; lng: number }[], idx: number): number {
  if (idx < 1 || idx >= coords.length - 1) return 0
  const prev = coords[idx - 1]
  const curr = coords[idx]
  const next = coords[idx + 1]
  const a1 = Math.atan2(curr.lng - prev.lng, curr.lat - prev.lat)
  const a2 = Math.atan2(next.lng - curr.lng, next.lat - curr.lat)
  let diff = Math.abs(a2 - a1)
  if (diff > Math.PI) diff = 2 * Math.PI - diff
  return diff
}

function roadSpeedFactor(angleDiff: number, segLength: number): number {
  if (angleDiff > Math.PI / 3) return 0.15   // very sharp = nearly stopped
  if (angleDiff > Math.PI / 4) return 0.3    // sharp corner
  if (angleDiff > Math.PI / 8) return 0.55   // moderate turn
  if (segLength > 0.0005) return 1.0          // straight highway
  return 0.75                                  // residential
}

function hasCarAhead(car: TrafficCar): boolean {
  for (const other of cars) {
    if (other.id === car.id || !other.active || other.routePending) continue
    const dLat = other.lat - car.lat
    const dLng = other.lng - car.lng
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)
    if (dist > FOLLOWING_DISTANCE) continue
    const angleToOther = Math.atan2(dLng, dLat)
    let headingDiff = Math.abs(angleToOther - car.heading)
    if (headingDiff > Math.PI) headingDiff = 2 * Math.PI - headingDiff
    if (headingDiff < Math.PI / 2) return true
  }
  return false
}

/** Check if car is roughly inside the extended viewport */
function isInView(lat: number, lng: number, margin: number = 0.005): boolean {
  return (
    lat >= viewBounds.south - margin &&
    lat <= viewBounds.north + margin &&
    lng >= viewBounds.west - margin &&
    lng <= viewBounds.east + margin
  )
}

// ---- Public API ----

export function updateViewBounds(bounds: { north: number; south: number; east: number; west: number }) {
  viewBounds = bounds
}

export function startTraffic() {
  isActive = true
  cars.length = 0
  nextCarId = 0
  pendingFetches = 0

  // Seed cars spread across viewport -- routes fetched async with staggering
  for (let i = 0; i < TARGET_CARS; i++) {
    const car = createCarShell()
    cars.push(car)
  }

  let delay = 0
  for (const car of cars) {
    setTimeout(() => {
      if (isActive && car.active) assignRoute(car)
    }, delay)
    delay += 150
  }
}

export function stopTraffic() {
  isActive = false
  cars.length = 0
}

export function tickTraffic() {
  if (!isActive) return

  for (const car of cars) {
    if (!car.active || car.routePending) continue
    if (car.routeCoords.length < 2) { car.active = false; continue }

    // ---- Approaching end of route: seamless path refresh ----
    const remaining = car.routeCoords.length - 1 - car.routeIndex
    
    // Pre-fetch next route when ~30% remaining
    if (remaining < car.routeCoords.length * 0.3 && !car.nextRoute && !car.nextRoutePending) {
      prefetchNextRoute(car)
    }

    // At end of route: switch to next route seamlessly or deactivate
    if (car.routeIndex >= car.routeCoords.length - 2) {
      if (car.nextRoute && car.nextRoute.length >= 3) {
        // Seamless continuation
        car.routeCoords = car.nextRoute
        car.routeIndex = 0
        car.nextRoute = null
        car.nextRoutePending = false
        car.lat = car.routeCoords[0].lat
        car.lng = car.routeCoords[0].lng
        continue
      } else if (!car.nextRoutePending) {
        // No next route ready and not fetching -- deactivate
        car.active = false
        continue
      }
      // Still waiting for next route -- just stop at end
      continue
    }

    // ---- Stopped at red light ----
    if (car.stoppedTicks > 0) {
      car.stoppedTicks--
      continue
    }

    // ---- Collision avoidance ----
    if (hasCarAhead(car)) continue

    // ---- Road speed ----
    const idx = Math.floor(car.routeIndex)
    const angleDiff = getAngleChange(car.routeCoords, idx)
    const curr = car.routeCoords[idx]
    const nextPt = car.routeCoords[Math.min(idx + 1, car.routeCoords.length - 1)]
    const segLen = Math.sqrt((nextPt.lat - curr.lat) ** 2 + (nextPt.lng - curr.lng) ** 2)
    const roadFactor = roadSpeedFactor(angleDiff, segLen)

    // ---- Traffic light at junctions ----
    // Sharp turns with high probability of stopping (simulates red/green lights)
    if (angleDiff > Math.PI / 4 && Math.random() < 0.20) {
      car.stoppedTicks = RED_LIGHT_MIN + Math.floor(Math.random() * (RED_LIGHT_MAX - RED_LIGHT_MIN))
      continue
    }

    // ---- Braking near end ----
    const brakeFactor = remaining < 8 ? 0.4 + (remaining / 8) * 0.6 : 1.0

    // ---- Move ----
    const move = car.speed * roadFactor * brakeFactor * (0.97 + Math.random() * 0.06)
    const newIndex = Math.min(car.routeIndex + move, car.routeCoords.length - 1)

    const fi = Math.floor(newIndex)
    const ni = Math.min(fi + 1, car.routeCoords.length - 1)
    const frac = newIndex - fi
    const p0 = car.routeCoords[fi]
    const p1 = car.routeCoords[ni]

    car.lat = p0.lat + (p1.lat - p0.lat) * frac
    car.lng = p0.lng + (p1.lng - p0.lng) * frac
    car.routeIndex = newIndex
    car.heading = Math.atan2(p1.lng - p0.lng, p1.lat - p0.lat)
  }

  // ---- Cleanup: remove inactive or far-out-of-view cars ----
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i]
    if (!c.active || (!c.routePending && !isInView(c.lat, c.lng, 0.01))) {
      cars.splice(i, 1)
    }
  }

  // ---- Spawn replacements ----
  while (cars.length < TARGET_CARS && pendingFetches < MAX_PENDING_FETCHES) {
    const car = createCarShell()
    cars.push(car)
    assignRoute(car)
  }
}

/** Get all active, routed cars for rendering */
export function getCars(): ReadonlyArray<TrafficCar> {
  return cars.filter(c => c.active && !c.routePending && c.routeCoords.length >= 2)
}

/**
 * Traffic density at a position (0.0 to 1.0).
 * Counts nearby routed NPC cars within ~200m radius.
 */
export function getTrafficDensity(lat: number, lng: number): number {
  if (!isActive) return 0
  const radius = 0.002
  let count = 0
  for (const car of cars) {
    if (!car.active || car.routePending) continue
    const dLat = car.lat - lat
    const dLng = car.lng - lng
    if (Math.abs(dLat) > radius || Math.abs(dLng) > radius) continue
    if (Math.sqrt(dLat * dLat + dLng * dLng) < radius) count++
  }
  return Math.min(1.0, count / 8)
}
