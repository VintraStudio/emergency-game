/**
 * NPC Traffic Manager
 * Manages 25-35 simulated cars that drive within the viewport.
 * Cars move along grid-like roads, stop at intersections, and create
 * traffic density zones that slow down emergency vehicles.
 * 
 * This module is standalone (not in React state) to avoid triggering re-renders.
 */

export interface TrafficCar {
  id: number
  lat: number
  lng: number
  targetLat: number
  targetLng: number
  speed: number          // degrees per tick
  heading: number        // angle in radians
  color: string
  width: number          // car width in px
  stoppedTicks: number   // remaining ticks stopped at intersection
  active: boolean
}

// Realistic car colors
const CAR_COLORS = [
  "#c8ccd0", // silver
  "#222222", // black
  "#ffffff", // white
  "#334155", // dark gray
  "#1e3a5f", // dark blue
  "#8b2020", // dark red
  "#2d5016", // dark green
  "#4a3728", // brown
  "#94a3b8", // light gray
  "#b91c1c", // red
]

const TARGET_CARS = 30
const INTERSECTION_STOP_CHANCE = 0.15     // 15% chance to stop at grid crossing
const INTERSECTION_STOP_TICKS = 8         // stop for ~0.8 sec at 100ms ticks
const GRID_SPACING_LAT = 0.002            // ~220m between "roads"
const GRID_SPACING_LNG = 0.003            // ~230m between "roads"

// Viewport bounds
let viewBounds = { north: 0, south: 0, east: 0, west: 0 }
let isActive = false

// Car pool
const cars: TrafficCar[] = []
let nextCarId = 0

// Snap a coordinate to the nearest grid line
function snapToGrid(val: number, spacing: number): number {
  return Math.round(val / spacing) * spacing
}

// Get a random grid-aligned position within bounds
function randomGridPosition(expand = 0.001): { lat: number; lng: number } {
  const lat = viewBounds.south - expand + Math.random() * (viewBounds.north - viewBounds.south + expand * 2)
  const lng = viewBounds.west - expand + Math.random() * (viewBounds.east - viewBounds.west + expand * 2)
  
  // Snap to grid with ~50% chance (mix of grid-following and free-roaming)
  if (Math.random() < 0.6) {
    return {
      lat: snapToGrid(lat, GRID_SPACING_LAT),
      lng: snapToGrid(lng, GRID_SPACING_LNG),
    }
  }
  return { lat, lng }
}

// Generate a target position along the same grid line (N/S or E/W movement)
function generateTarget(car: TrafficCar): { lat: number; lng: number } {
  const goHorizontal = Math.random() < 0.5
  
  if (goHorizontal) {
    // Move east/west along same lat
    const direction = Math.random() < 0.5 ? 1 : -1
    const distance = 0.003 + Math.random() * 0.008
    return {
      lat: car.lat,
      lng: car.lng + direction * distance,
    }
  } else {
    // Move north/south along same lng
    const direction = Math.random() < 0.5 ? 1 : -1
    const distance = 0.002 + Math.random() * 0.006
    return {
      lat: car.lat + direction * distance,
      lng: car.lng,
    }
  }
}

// Spawn a car at a position slightly outside the viewport
function spawnCar(): TrafficCar {
  const edge = Math.floor(Math.random() * 4) // 0=top, 1=right, 2=bottom, 3=left
  const margin = 0.002

  let lat = 0, lng = 0

  switch (edge) {
    case 0: // top
      lat = viewBounds.north + margin
      lng = viewBounds.west + Math.random() * (viewBounds.east - viewBounds.west)
      break
    case 1: // right
      lat = viewBounds.south + Math.random() * (viewBounds.north - viewBounds.south)
      lng = viewBounds.east + margin
      break
    case 2: // bottom
      lat = viewBounds.south - margin
      lng = viewBounds.west + Math.random() * (viewBounds.east - viewBounds.west)
      break
    case 3: // left
      lat = viewBounds.south + Math.random() * (viewBounds.north - viewBounds.south)
      lng = viewBounds.west - margin
      break
  }

  // Snap to grid
  lat = snapToGrid(lat, GRID_SPACING_LAT)
  lng = snapToGrid(lng, GRID_SPACING_LNG)

  const target = generateTarget({ lat, lng } as TrafficCar)
  const speed = 0.00002 + Math.random() * 0.00003 // variable speed

  return {
    id: nextCarId++,
    lat,
    lng,
    targetLat: target.lat,
    targetLng: target.lng,
    speed,
    heading: Math.atan2(target.lng - lng, target.lat - lat),
    color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    width: 3 + Math.floor(Math.random() * 2), // 3-4px
    stoppedTicks: 0,
    active: true,
  }
}

// Check if car is within expanded viewport
function isInBounds(lat: number, lng: number, margin = 0.005): boolean {
  return (
    lat >= viewBounds.south - margin &&
    lat <= viewBounds.north + margin &&
    lng >= viewBounds.west - margin &&
    lng <= viewBounds.east + margin
  )
}

// Check if position is near a grid intersection
function isNearIntersection(lat: number, lng: number): boolean {
  const latDist = Math.abs(lat - snapToGrid(lat, GRID_SPACING_LAT))
  const lngDist = Math.abs(lng - snapToGrid(lng, GRID_SPACING_LNG))
  return latDist < 0.0003 && lngDist < 0.0003
}

export function updateViewBounds(bounds: { north: number; south: number; east: number; west: number }) {
  viewBounds = bounds
}

export function startTraffic() {
  isActive = true
  // Seed initial cars spread across the viewport
  cars.length = 0
  for (let i = 0; i < TARGET_CARS; i++) {
    const pos = randomGridPosition()
    const target = generateTarget(pos as TrafficCar)
    const speed = 0.00002 + Math.random() * 0.00003
    cars.push({
      id: nextCarId++,
      lat: pos.lat,
      lng: pos.lng,
      targetLat: target.lat,
      targetLng: target.lng,
      speed,
      heading: Math.atan2(target.lng - pos.lng, target.lat - pos.lat),
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
      width: 3 + Math.floor(Math.random() * 2),
      stoppedTicks: 0,
      active: true,
    })
  }
}

export function stopTraffic() {
  isActive = false
  cars.length = 0
}

export function tickTraffic() {
  if (!isActive) return

  // Move active cars
  for (const car of cars) {
    if (!car.active) continue

    // Handle stopped cars
    if (car.stoppedTicks > 0) {
      car.stoppedTicks--
      continue
    }

    // Calculate distance to target
    const dLat = car.targetLat - car.lat
    const dLng = car.targetLng - car.lng
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)

    if (dist < 0.0002) {
      // Reached target - generate new one
      const newTarget = generateTarget(car)
      car.targetLat = newTarget.lat
      car.targetLng = newTarget.lng
      car.heading = Math.atan2(newTarget.lng - car.lng, newTarget.lat - car.lat)
      
      // Random speed change
      car.speed = 0.00002 + Math.random() * 0.00003
      return
    }

    // Check intersection stop
    if (isNearIntersection(car.lat, car.lng) && Math.random() < INTERSECTION_STOP_CHANCE) {
      car.stoppedTicks = INTERSECTION_STOP_TICKS + Math.floor(Math.random() * 8)
      continue
    }

    // Move toward target
    const step = car.speed
    const ratio = step / dist
    car.lat += dLat * ratio
    car.lng += dLng * ratio
    car.heading = Math.atan2(dLng, dLat)

    // Check if out of bounds
    if (!isInBounds(car.lat, car.lng)) {
      car.active = false
    }
  }

  // Remove inactive cars and spawn new ones
  for (let i = cars.length - 1; i >= 0; i--) {
    if (!cars[i].active) {
      cars.splice(i, 1)
    }
  }

  // Maintain target car count
  while (cars.length < TARGET_CARS) {
    cars.push(spawnCar())
  }
}

/** Get all active cars for rendering */
export function getCars(): ReadonlyArray<TrafficCar> {
  return cars
}

/**
 * Get traffic density at a given position (0.0 to 1.0)
 * Counts nearby NPC cars within ~200m radius.
 * Used by game-store to slow emergency vehicles.
 */
export function getTrafficDensity(lat: number, lng: number): number {
  if (!isActive) return 0

  const radius = 0.002 // ~200m
  let count = 0

  for (const car of cars) {
    if (!car.active) continue
    const dLat = car.lat - lat
    const dLng = car.lng - lng
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)
    if (dist < radius) {
      count++
    }
  }

  // Normalize: 0 cars = 0.0, 8+ cars = 1.0
  return Math.min(1.0, count / 8)
}
