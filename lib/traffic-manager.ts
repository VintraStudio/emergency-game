/**
 * NPC Traffic Manager
 * Cars drive along real OSRM routes on the road network.
 * Each car spawns with a pre-generated route and follows it smoothly.
 * Routes are hidden from the player -- only unit routes are rendered.
 *
 * Cars:
 *  - Are tiny round dots (2-3px radius)
 *  - Slow at corners/junctions, faster on straight roads
 *  - Keep safe following distance (no collisions)
 *  - Stop at intersections occasionally (simulated traffic lights)
 *
 * This module is standalone (not in React state) to avoid re-renders.
 */

import { getRoute } from "./route-service"

export interface TrafficCar {
  id: number
  lat: number
  lng: number
  routeCoords: { lat: number; lng: number }[]
  routeIndex: number     // fractional index along route
  speed: number          // base route-points per tick
  heading: number        // current heading in radians
  color: string
  radius: number         // render radius in px (tiny)
  stoppedTicks: number   // ticks remaining stopped
  active: boolean
  routePending: boolean  // true while OSRM fetch is in flight
}

// Realistic car colors (muted, realistic palette)
const CAR_COLORS = [
  "#c8ccd0", // silver
  "#1a1a1a", // black
  "#e8e8e8", // white
  "#3b4252", // dark gray
  "#1e3a5f", // dark blue
  "#7a2020", // dark red
  "#2d5016", // dark green
  "#5c4033", // brown
  "#8899aa", // blue-gray
  "#b22222", // firebrick
  "#4a6274", // steel
  "#f5f0e8", // cream
]

const TARGET_CARS = 28
const INTERSECTION_STOP_TICKS_MIN = 10    // ~1s minimum stop
const INTERSECTION_STOP_TICKS_MAX = 30    // ~3s max stop
const FOLLOWING_DISTANCE = 0.00007        // ~8m safe distance (reduced from 13m)
const ROUTE_FETCH_CONCURRENCY = 3         // max parallel OSRM requests

// Viewport bounds
let viewBounds = { north: 0, south: 0, east: 0, west: 0 }
let isActive = false

// Car pool
const cars: TrafficCar[] = []
let nextCarId = 0
let pendingRouteFetches = 0

// Generate a random start point at the edge of the viewport (or slightly outside)
function randomEdgePoint(): { lat: number; lng: number } {
  const margin = 0.003
  const edge = Math.floor(Math.random() * 4)
  const latSpan = viewBounds.north - viewBounds.south
  const lngSpan = viewBounds.east - viewBounds.west

  switch (edge) {
    case 0: return { lat: viewBounds.north + margin, lng: viewBounds.west + Math.random() * lngSpan }
    case 1: return { lat: viewBounds.south + Math.random() * latSpan, lng: viewBounds.east + margin }
    case 2: return { lat: viewBounds.south - margin, lng: viewBounds.west + Math.random() * lngSpan }
    default: return { lat: viewBounds.south + Math.random() * latSpan, lng: viewBounds.west - margin }
  }
}

// Generate a random destination across the viewport
function randomDestination(from: { lat: number; lng: number }): { lat: number; lng: number } {
  // Pick a point on the opposite-ish side of the viewport to get a nice long route
  const latCenter = (viewBounds.north + viewBounds.south) / 2
  const lngCenter = (viewBounds.east + viewBounds.west) / 2
  const latSpan = viewBounds.north - viewBounds.south
  const lngSpan = viewBounds.east - viewBounds.west

  // Offset from center, biased away from the starting point
  const dLat = from.lat > latCenter ? -0.3 - Math.random() * 0.5 : 0.3 + Math.random() * 0.5
  const dLng = from.lng > lngCenter ? -0.3 - Math.random() * 0.5 : 0.3 + Math.random() * 0.5

  return {
    lat: latCenter + dLat * latSpan * 0.5 + (Math.random() - 0.5) * latSpan * 0.3,
    lng: lngCenter + dLng * lngSpan * 0.5 + (Math.random() - 0.5) * lngSpan * 0.3,
  }
}

// Spawn a car shell (route will be fetched async)
function createCar(): TrafficCar {
  const start = randomEdgePoint()
  return {
    id: nextCarId++,
    lat: start.lat,
    lng: start.lng,
    routeCoords: [],
    routeIndex: 0,
    speed: 0.4 + Math.random() * 0.3, // route-points per tick (slow NPC speed)
    heading: 0,
    color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    radius: 2, // tiny dots
    stoppedTicks: 0,
    active: true,
    routePending: true,
  }
}

// Fetch a route for a car, then mark it ready
async function assignRoute(car: TrafficCar) {
  pendingRouteFetches++
  const dest = randomDestination(car)
  const route = await getRoute({ lat: car.lat, lng: car.lng }, dest)
  pendingRouteFetches--

  if (route.length >= 2) {
    car.routeCoords = route
    car.routeIndex = 0
    car.lat = route[0].lat
    car.lng = route[0].lng
    car.heading = Math.atan2(route[1].lng - route[0].lng, route[1].lat - route[0].lat)
    car.routePending = false
  } else {
    // Route fetch failed -- deactivate so it gets recycled
    car.active = false
    car.routePending = false
  }
}

// ----- Movement helpers -----

// Check angle between consecutive route segments
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

// Get road-speed factor from angle change
function roadSpeedFactor(angleDiff: number, segLength: number): number {
  if (angleDiff > Math.PI / 4) return 0.25      // sharp corner / junction
  if (angleDiff > Math.PI / 8) return 0.5       // moderate turn
  if (segLength > 0.0005) return 1.1             // highway-like straight
  return 0.8                                      // residential
}

// Check if any other car is too close ahead
function hasCarAhead(car: TrafficCar): boolean {
  for (const other of cars) {
    if (other.id === car.id || !other.active || other.routePending) continue
    const dLat = other.lat - car.lat
    const dLng = other.lng - car.lng
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)
    if (dist > FOLLOWING_DISTANCE) continue

    // Check if the other car is roughly ahead of us (within +-90 deg of heading)
    const angleToOther = Math.atan2(dLng, dLat)
    let headingDiff = Math.abs(angleToOther - car.heading)
    if (headingDiff > Math.PI) headingDiff = 2 * Math.PI - headingDiff
    if (headingDiff >= Math.PI / 2) continue

    // NY: må også kjøre omtrent samme retning, ellers lar vi dem passere
    let dirDiff = Math.abs(other.heading - car.heading)
    if (dirDiff > Math.PI) dirDiff = 2 * Math.PI - dirDiff
    if (dirDiff > Math.PI / 3) continue // > 60° = regn som "ikke samme fil/retning"

    return true
  }
  return false
}

// ----- Public API -----

export function updateViewBounds(bounds: { north: number; south: number; east: number; west: number }) {
  viewBounds = bounds
}

export function startTraffic() {
  isActive = true
  cars.length = 0
  nextCarId = 0
  pendingRouteFetches = 0

  // Seed initial batch -- routes fetched async
  for (let i = 0; i < TARGET_CARS; i++) {
    const car = createCar()
    // Spread initial cars across the viewport (not just edges)
    car.lat = viewBounds.south + Math.random() * (viewBounds.north - viewBounds.south)
    car.lng = viewBounds.west + Math.random() * (viewBounds.east - viewBounds.west)
    cars.push(car)
  }

  // Stagger route fetches to avoid hammering OSRM
  let delay = 0
  for (const car of cars) {
    setTimeout(() => {
      if (isActive && car.active) assignRoute(car)
    }, delay)
    delay += 200 // 200ms between fetches
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

    // No route or finished route -> deactivate
    if (car.routeCoords.length < 2 || car.routeIndex >= car.routeCoords.length - 1) {
      car.active = false
      continue
    }

    // Handle stopped (traffic light / intersection)
    if (car.stoppedTicks > 0) {
      car.stoppedTicks--
      continue
    }

    // Check following distance
    if (hasCarAhead(car)) {
      continue // Don't move, wait for car ahead to clear
    }

    // Road speed based on geometry
    const idx = Math.floor(car.routeIndex)
    const angleDiff = getAngleChange(car.routeCoords, idx)
    const curr = car.routeCoords[idx]
    const nextPt = car.routeCoords[Math.min(idx + 1, car.routeCoords.length - 1)]
    const segLen = Math.sqrt((nextPt.lat - curr.lat) ** 2 + (nextPt.lng - curr.lng) ** 2)
    const roadFactor = roadSpeedFactor(angleDiff, segLen)

    // Intersection stop: sharp turns have a chance to trigger a stop
    if (angleDiff > Math.PI / 4 && car.stoppedTicks === 0 && Math.random() < 0.12) {
      car.stoppedTicks = INTERSECTION_STOP_TICKS_MIN + Math.floor(Math.random() * (INTERSECTION_STOP_TICKS_MAX - INTERSECTION_STOP_TICKS_MIN))
      continue
    }

    // Braking near end of route
    const remaining = car.routeCoords.length - 1 - car.routeIndex
    const brakeFactor = remaining < 10 ? 0.3 + (remaining / 10) * 0.7 : 1.0

    // Move along route
    const move = car.speed * roadFactor * brakeFactor * (0.97 + Math.random() * 0.06)
    const newIndex = Math.min(car.routeIndex + move, car.routeCoords.length - 1)

    // Interpolate position
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

  // Remove finished/inactive cars
  for (let i = cars.length - 1; i >= 0; i--) {
    if (!cars[i].active) {
      cars.splice(i, 1)
    }
  }

  // Spawn replacements (throttled by pending fetches)
  while (cars.length < TARGET_CARS && pendingRouteFetches < ROUTE_FETCH_CONCURRENCY) {
    const car = createCar()
    cars.push(car)
    assignRoute(car)
  }
}

/** Get all active cars for rendering (routes are NOT exposed) */
export function getCars(): ReadonlyArray<TrafficCar> {
  return cars.filter(c => c.active && !c.routePending && c.routeCoords.length >= 2)
}

/**
 * Traffic density at a position (0.0 to 1.0).
 * Counts nearby routed NPC cars within ~200m radius.
 * Used by game-store to slow emergency vehicles.
 */
export function getTrafficDensity(lat: number, lng: number): number {
  if (!isActive) return 0

  const radius = 0.002 // ~200m
  let count = 0

  for (const car of cars) {
    if (!car.active || car.routePending) continue
    const dLat = car.lat - lat
    const dLng = car.lng - lng
    if (Math.abs(dLat) > radius || Math.abs(dLng) > radius) continue
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)
    if (dist < radius) count++
  }

  // 0 cars = 0.0, 8+ cars nearby = 1.0
  return Math.min(1.0, count / 8)
}
