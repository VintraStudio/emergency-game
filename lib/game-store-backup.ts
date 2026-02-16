"use client"

import { useSyncExternalStore, useCallback } from "react"
import type {
  GameState,
  Building,
  Mission,
  Vehicle,
  BuildingType,
  MissionType,
  LatLng,
  VehicleStatus,
  CityConfig,
} from "./game-types"
import { BUILDING_CONFIGS, MISSION_CONFIGS } from "./game-types"
import { getTrafficDensity, tickTraffic } from "./traffic-manager"
import { getRouteQueued } from "./route-service"

let nextId = 1
function genId(prefix: string) {
  return `${prefix}-${nextId++}`
}

const INITIAL_STATE: GameState = {
  money: 50000,
  population: 0,
  buildings: [],
  missions: [],
  vehicles: [],
  gameTime: Date.now(),
  gameStartTime: Date.now(),
  gameSpeed: 1,
  isPaused: true,
  gameOver: false,
  selectedBuilding: null,
  selectedMission: null,
  placingBuilding: null,
  managingBuilding: null,
  missionsCompleted: 0,
  missionsFailed: 0,
  city: null,
  newMissions: [],
  unreadMissionCount: 0,
}

// Tracks the real wall-clock time of the last tick so we can compute deltas
let lastTickRealTime = Date.now()
// Tracks the real wall-clock time of the last time update for smooth display
let lastTimeUpdateRealTime = Date.now()

// --- Mission auto-spawn timer (independent of UI/tab state) ---
let missionSpawnTimer: ReturnType<typeof setTimeout> | null = null
let nextMissionSpawnTime = 0 // wall-clock ms when next mission should spawn

let state: GameState = { ...INITIAL_STATE }
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}
function getState(): GameState {
  return state
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGameState(): GameState {
  return useSyncExternalStore(subscribe, getState, getState)
}

// --- Pending route fetches: track in-flight route requests to merge into state safely ---
const pendingRoutes = new Map<string, Promise<LatLng[]>>()

// Safely apply a resolved route to the current state snapshot.
// Because `state` may have been replaced by tick() in the meantime, we read
// the *current* state at resolution time, not the stale closure.
function applyRouteToVehicle(vehicleId: string, routeCoords: LatLng[]) {
  const nextVehicles = state.vehicles.map((v) =>
    v.id === vehicleId ? { ...v, routeCoords, routeIndex: 0 } : v
  )

  state = {
    ...state,
    vehicles: nextVehicles,
  }

  pendingRoutes.delete(vehicleId)
  emit()
}

// Deterministic fallback route (no random zigzag)
function fallbackRoute(from: LatLng, to: LatLng): LatLng[] {
  const steps = 24
  const points: LatLng[] = []

  const dLat = to.lat - from.lat
  const dLng = to.lng - from.lng

  // mild deterministic curve (not random)
  const mid = { lat: from.lat + dLat * 0.5, lng: from.lng + dLng * 0.5 }
  const perpLen = Math.sqrt(dLat * dLat + dLng * dLng) || 0.001
  const perpLat = -dLng / perpLen
  const perpLng = dLat / perpLen
  const curve = perpLen * 0.015 // 1.5% of distance (mild)

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

// Find nearest point on route to snap to when upgrading from fallback to OSRM
function nearestRouteIndex(route: LatLng[], pos: LatLng): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < route.length; i++) {
    const dLat = route[i].lat - pos.lat
    const dLng = route[i].lng - pos.lng
    const d = dLat * dLat + dLng * dLng
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

// Helper: sync buildings[].vehicles with state.vehicles after each update
function syncBuildingsWithVehicles(nextVehicles: Vehicle[]) {
  const byBuilding = new Map<string, Vehicle[]>()
  for (const v of nextVehicles) {
    const arr = byBuilding.get(v.buildingId) ?? []
    arr.push(v)
    byBuilding.set(v.buildingId, arr)
  }

  return state.buildings.map((b) => ({
    ...b,
    vehicles: (byBuilding.get(b.id) ?? []).map(v => ({ ...v })),
  }))
}

// Vehicle movement: advance along routeCoords, scaled by game speed.
// TARGET_TICKS_TO_COMPLETE sets how many ticks (at 200ms each) a full route takes at 1x.
// Higher value = slower, more relaxed movement.
const TARGET_TICKS_TO_COMPLETE = 600

function moveVehicleAlongRoute(v: Vehicle, gameSpeed: number): Vehicle {
  if (v.routeCoords.length === 0 || v.routeIndex >= v.routeCoords.length - 1) {
    return v
  }

  // Base speed: route points per tick
  const basePointsPerTick = Math.max(0.5, v.routeCoords.length / TARGET_TICKS_TO_COMPLETE)
  
  // Detect road type by looking at the angle change between route segments.
  // Straight segments = highway (fast), sharp turns = junctions (slow).
  const idx = Math.floor(v.routeIndex)
  let roadFactor = 1.0
  if (idx >= 1 && idx < v.routeCoords.length - 1) {
    const prev = v.routeCoords[idx - 1]
    const curr = v.routeCoords[idx]
    const next = v.routeCoords[Math.min(idx + 1, v.routeCoords.length - 1)]
    // Angle between prev->curr and curr->next
    const a1 = Math.atan2(curr.lng - prev.lng, curr.lat - prev.lat)
    const a2 = Math.atan2(next.lng - curr.lng, next.lat - curr.lat)
    let angleDiff = Math.abs(a2 - a1)
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff
    // Sharp turn (> 45deg) = junction/corner -> slow down
    if (angleDiff > Math.PI / 4) {
      roadFactor = 0.35 // Very slow at sharp corners
    } else if (angleDiff > Math.PI / 8) {
      roadFactor = 0.6  // Moderate turn
    } else {
      // Check segment length to detect highway vs residential
      const segDist = Math.sqrt(
        (next.lat - curr.lat) ** 2 + (next.lng - curr.lng) ** 2
      )
      // Long straight segments = highway
      roadFactor = segDist > 0.0005 ? 1.2 : 0.85
    }
  }
  
  // Small random variation for realistic driving (97-103%)
  const randomVariation = 0.97 + Math.random() * 0.06
  
  // Braking near destination
  const remainingDistance = v.routeCoords.length - 1 - v.routeIndex
  const brakingFactor = remainingDistance < 15 ? 0.25 + (remainingDistance / 15) * 0.75 : 1.0

  // Traffic density slowdown: up to 40% slower in heavy traffic areas
  const trafficDensity = getTrafficDensity(v.position.lat, v.position.lng)
  const trafficFactor = 1.0 - (trafficDensity * 0.4) // 60-100% speed
  
  const pointsToMove = basePointsPerTick * gameSpeed * roadFactor * randomVariation * brakingFactor * trafficFactor
  
  // Clamp movement for smooth, relaxed feel
  const maxMove = basePointsPerTick * 1.3 * gameSpeed
  const clampedMove = Math.min(pointsToMove, maxMove)
  const clampedIndex = Math.min(v.routeIndex + clampedMove, v.routeCoords.length - 1)
  
  // Floor the index to access valid array positions; keep fractional for smooth accumulation
  const flooredIdx = Math.floor(clampedIndex)
  const nextIdx = Math.min(flooredIdx + 1, v.routeCoords.length - 1)
  const frac = clampedIndex - flooredIdx

  // Interpolate between the two closest route points for smooth movement
  const p0 = v.routeCoords[flooredIdx]
  const p1 = v.routeCoords[nextIdx]
  const pos = {
    lat: p0.lat + (p1.lat - p0.lat) * frac,
    lng: p0.lng + (p1.lng - p0.lng) * frac,
  }

  return {
    ...v,
    position: pos,
    routeIndex: clampedIndex,
  }
}

// Generate mission positions that cluster near the city center and player buildings.
// Uses simple lat/lng offsets (degrees) to stay within visible map area.
// ~0.01 degree ~ 1.1 km at these latitudes.
function smartMissionPosition(city: CityConfig, _missionType: MissionType, buildings: Building[]): LatLng {
  const center: LatLng = city.center

  // Half-span of the city bounds (in degrees) - used to clamp positions
  const latSpan = (city.bounds.north - city.bounds.south) / 2
  const lngSpan = (city.bounds.east - city.bounds.west) / 2

  // 80% chance to spawn near an existing building (within ~0.8-1.2 km)
  if (buildings.length > 0 && Math.random() < 0.8) {
    const building = buildings[Math.floor(Math.random() * buildings.length)]
    const offsetLat = (Math.random() - 0.5) * 0.02 // +/- ~1.1 km
    const offsetLng = (Math.random() - 0.5) * 0.025
    return clampToCity(
      { lat: building.position.lat + offsetLat, lng: building.position.lng + offsetLng },
      center,
      latSpan,
      lngSpan,
    )
  }

  // 20% fallback: spawn within a tight radius around city center (~1.5 km)
  const offsetLat = (Math.random() - 0.5) * latSpan * 1.2
  const offsetLng = (Math.random() - 0.5) * lngSpan * 1.2
  return clampToCity(
    { lat: center.lat + offsetLat, lng: center.lng + offsetLng },
    center,
    latSpan,
    lngSpan,
  )
}

// Clamp a position so it never drifts outside the visible city bounds
function clampToCity(pos: LatLng, center: LatLng, latSpan: number, lngSpan: number): LatLng {
  return {
    lat: Math.max(center.lat - latSpan, Math.min(center.lat + latSpan, pos.lat)),
    lng: Math.max(center.lng - lngSpan, Math.min(center.lng + lngSpan, pos.lng)),
  }
}

// --- Internal mission generation (called by auto-spawn timer and manual trigger) ---
function internalGenerateMission() {
  if (!state.city || state.isPaused || state.gameOver) return

  // Check current active missions to ensure we don't exceed 5
  const activeMissions = state.missions.filter(
    (m) => m.status === "pending" || m.status === "dispatched"
  ).length
  if (activeMissions >= 5) return

  const types: MissionType[] = ["fire", "traffic-accident", "medical-emergency", "crime", "infrastructure"]
  const type = types[Math.floor(Math.random() * types.length)]
  const config = MISSION_CONFIGS[type]
  const titleIndex = Math.floor(Math.random() * config.titles.length)

  const position = smartMissionPosition(state.city, type, state.buildings)

  const mission: Mission = {
    id: genId("msn"),
    type,
    title: config.titles[titleIndex],
    description: config.descriptions[titleIndex],
    position,
    status: "pending",
    reward: config.baseReward + Math.floor(Math.random() * 500),
    penalty: config.basePenalty + Math.floor(Math.random() * 200),
    timeLimit: config.baseTimeLimit,
    timeRemaining: config.baseTimeLimit,
    requiredBuildings: config.requiredBuildings,
    dispatchedVehicles: [],
    workDuration: config.workDuration,
    createdAt: state.gameTime,
  }

  state = { 
    ...state, 
    missions: [...state.missions, mission],
    newMissions: [...state.newMissions, mission],
    unreadMissionCount: state.unreadMissionCount + 1,
  }
  emit()
}

// --- Auto-spawn scheduler: runs independently, uses setTimeout chain ---
// Each spawn schedules the next with a random delay (30min-3h game time, scaled by speed).
// This runs inside the store module itself so it is independent of which UI tab is open.
function scheduleNextMissionSpawn() {
  if (missionSpawnTimer) {
    clearTimeout(missionSpawnTimer)
    missionSpawnTimer = null
  }

  if (state.isPaused || state.gameOver || !state.city) return

  // Random delay between 30 minutes and 3 hours (in game time)
  // 30min game time = 30s real time, 3h game time = 180s real time at 1x speed
  const baseDelay = 30000 + Math.random() * 150000 // 30s to 3min in real ms
  const delay = baseDelay / state.gameSpeed
  nextMissionSpawnTime = Date.now() + delay

  missionSpawnTimer = setTimeout(() => {
    missionSpawnTimer = null
    // Only spawn if game is still running
    if (!state.isPaused && !state.gameOver && state.city) {
      internalGenerateMission()
      // Chain: schedule the next spawn
      scheduleNextMissionSpawn()
    }
  }, delay)
}

function stopMissionSpawnTimer() {
  if (missionSpawnTimer) {
    clearTimeout(missionSpawnTimer)
    missionSpawnTimer = null
  }
}

export function useGameActions() {
  const placeBuilding = useCallback(
    (type: BuildingType, position: LatLng, size: "small" | "large" = "small") => {
      const config = BUILDING_CONFIGS[type]
      const cost = size === "small" ? config.smallCost : config.largeCost
      if (state.money < cost) return false

      const buildingId = genId("bldg")

      const vehicles: Vehicle[] = config.vehicles.flatMap((v) => {
        const count = size === "small" ? Math.ceil(v.count / 2) : v.count
        return Array.from({ length: count }, () => ({
          id: genId("veh"),
          type: v.type,
          buildingId,
          status: "idle" as VehicleStatus,
          position: { ...position },
          routeCoords: [],
          routeIndex: 0,
          workTimeRemaining: 0,
        }))
      })

      const building: Building = {
        id: buildingId,
        type,
        size,
        level: 1,
        name: `${config.name} ${state.buildings.filter((b) => b.type === type).length + 1}`,
        position,
        vehicles,
        staff: size === "small" ? 5 : 12,
        maxStaff: size === "small" ? 8 : 20,
        upgrades: [],
        cost,
        efficiency: size === "small" ? 0.7 : 1,
      }

      state = {
        ...state,
        money: state.money - cost,
        buildings: [...state.buildings, building],
        vehicles: [...state.vehicles, ...vehicles],
        placingBuilding: null,
      }
      emit()
      return true
    },
    [],
  )

  const upgradeBuilding = useCallback((buildingId: string) => {
    const building = state.buildings.find((b) => b.id === buildingId)
    if (!building) return false

    const config = BUILDING_CONFIGS[building.type]
    if (building.level >= config.maxLevel) return false
    if (state.money < config.upgradeCost * building.level) return false

    const upgradeCost = config.upgradeCost * building.level
    const newSize = building.level >= 2 ? "large" : building.size === "small" ? "large" : building.size

    const newVehicles: Vehicle[] = config.vehicles.flatMap((v) =>
      Array.from({ length: 1 }, () => ({
        id: genId("veh"),
        type: v.type,
        buildingId,
        status: "idle" as VehicleStatus,
        position: { ...building.position },
        routeCoords: [],
        routeIndex: 0,
        workTimeRemaining: 0,
      })),
    )

    state = {
      ...state,
      money: state.money - upgradeCost,
      buildings: state.buildings.map((b) =>
        b.id === buildingId
          ? {
              ...b,
              level: b.level + 1,
              size: newSize as "small" | "large",
              maxStaff: b.maxStaff + 5,
              staff: Math.min(b.staff + 2, b.maxStaff + 5),
              vehicles: [...b.vehicles, ...newVehicles],
              efficiency: Math.min(1, b.efficiency + 0.15),
            }
          : b,
      ),
      vehicles: [...state.vehicles, ...newVehicles],
      managingBuilding:
        state.managingBuilding?.id === buildingId
          ? {
              ...state.managingBuilding,
              level: state.managingBuilding.level + 1,
              size: newSize as "small" | "large",
              maxStaff: state.managingBuilding.maxStaff + 5,
              staff: Math.min(state.managingBuilding.staff + 2, state.managingBuilding.maxStaff + 5),
              vehicles: [...state.managingBuilding.vehicles, ...newVehicles],
              efficiency: Math.min(1, state.managingBuilding.efficiency + 0.15),
            }
          : state.managingBuilding,
    }
    emit()
    return true
  }, [])

  const hireStaff = useCallback((buildingId: string) => {
    const building = state.buildings.find((b) => b.id === buildingId)
    if (!building) return false

    const config = BUILDING_CONFIGS[building.type]
    if (building.staff >= building.maxStaff) return false
    if (state.money < config.staffCost) return false

    state = {
      ...state,
      money: state.money - config.staffCost,
      buildings: state.buildings.map((b) =>
        b.id === buildingId
          ? { ...b, staff: b.staff + 1, efficiency: Math.min(1, b.efficiency + 0.05) }
          : b,
      ),
      managingBuilding:
        state.managingBuilding?.id === buildingId
          ? {
              ...state.managingBuilding,
              staff: state.managingBuilding.staff + 1,
              efficiency: Math.min(1, state.managingBuilding.efficiency + 0.05),
            }
          : state.managingBuilding,
    }
    emit()
    return true
  }, [])

  const purchaseVehicle = useCallback((buildingId: string) => {
    const building = state.buildings.find((b) => b.id === buildingId)
    if (!building) return false

    const config = BUILDING_CONFIGS[building.type]
    if (state.money < config.vehicleCost) return false

    const vehicleType = config.vehicles[0]?.type || "Vehicle"
    const newVehicle: Vehicle = {
      id: genId("veh"),
      type: vehicleType,
      buildingId,
      status: "idle",
      position: { ...building.position },
      routeCoords: [],
      routeIndex: 0,
      workTimeRemaining: 0,
    }

    state = {
      ...state,
      money: state.money - config.vehicleCost,
      buildings: state.buildings.map((b) =>
        b.id === buildingId ? { ...b, vehicles: [...b.vehicles, newVehicle] } : b,
      ),
      vehicles: [...state.vehicles, newVehicle],
      managingBuilding:
        state.managingBuilding?.id === buildingId
          ? { ...state.managingBuilding, vehicles: [...state.managingBuilding.vehicles, newVehicle] }
          : state.managingBuilding,
    }
    emit()
    return true
  }, [])

  const sellBuilding = useCallback((buildingId: string) => {
    const building = state.buildings.find((b) => b.id === buildingId)
    if (!building) return

    const refund = Math.floor(building.cost * 0.5)
    const vehicleIds = new Set(building.vehicles.map((v) => v.id))

    state = {
      ...state,
      money: state.money + refund,
      buildings: state.buildings.filter((b) => b.id !== buildingId),
      vehicles: state.vehicles.filter((v) => !vehicleIds.has(v.id)),
      selectedBuilding: state.selectedBuilding?.id === buildingId ? null : state.selectedBuilding,
      managingBuilding: state.managingBuilding?.id === buildingId ? null : state.managingBuilding,
    }
    emit()
  }, [])

  const dispatchVehicle = useCallback((missionId: string) => {
    const mission = state.missions.find((m) => m.id === missionId)
    if (!mission || mission.status !== "pending") return

    const requiredTypes = mission.requiredBuildings
    const availableVehicles: Vehicle[] = []

    for (const bType of requiredTypes) {
      const buildingsOfType = state.buildings.filter((b) => b.type === bType)
      for (const bld of buildingsOfType) {
        const idle = state.vehicles.find(
          (v) => v.buildingId === bld.id && v.status === "idle" && !availableVehicles.includes(v),
        )
        if (idle) {
          availableVehicles.push(idle)
          break
        }
      }
    }

    if (availableVehicles.length === 0) return

    const vehicleIds = availableVehicles.map((v) => v.id)

    // Immediately give dispatched vehicles a "preparing" status so they wait
    // for the OSRM route to load before starting to move
    const immediateVehicles = availableVehicles.map((veh) => ({
      ...veh,
      status: "preparing" as VehicleStatus,
      missionId: mission.id,
      preparationTimeRemaining: 0.01, // 0.01 seconds preparation time (essentially immediate)
      routeCoords: [], // Empty route initially
      routeIndex: 0,
    }))

    const nextVehicles = state.vehicles.map((v) => {
      const updated = immediateVehicles.find((iv) => iv.id === v.id)
      return updated || v
    })

    state = {
      ...state,
      missions: state.missions.map((m) =>
        m.id === missionId
          ? { ...m, status: "dispatched" as const, dispatchedVehicles: vehicleIds }
          : m,
      ),
      vehicles: nextVehicles,
    }
    emit()

    // Start vehicles immediately on fallback routes, upgrade to OSRM in background
    for (const veh of availableVehicles) {
      // 1) Start instantly on fallback route
      const fallback = fallbackRoute(veh.position, mission.position)
      
      state = {
        ...state,
        vehicles: state.vehicles.map(v =>
          v.id === veh.id
            ? { ...v, status: "dispatched" as VehicleStatus, missionId: mission.id, routeCoords: fallback, routeIndex: 0 }
            : v
        ),
        buildings: syncBuildingsWithVehicles(state.vehicles.map(v =>
          v.id === veh.id
            ? { ...v, status: "dispatched" as VehicleStatus, missionId: mission.id, routeCoords: fallback, routeIndex: 0 }
            : v
        )),
      }
      emit()

      // 2) Background: try OSRM and upgrade when available
      const routePromise = getRouteQueued(veh.position, mission.position).then((osrmRoute) => {
        console.log(`OSRM route fetched for vehicle ${veh.id}: ${osrmRoute.length} points`)
        
        // Find current vehicle state and snap to nearest point on new route
        const current = state.vehicles.find(v => v.id === veh.id)
        if (!current || current.status !== "dispatched") {
          console.log(`Vehicle ${veh.id} no longer dispatched, skipping OSRM upgrade`)
          return osrmRoute
        }

        const nearestIndex = nearestRouteIndex(osrmRoute, current.position)
        
        // Upgrade to OSRM route without losing progress
        state = {
          ...state,
          vehicles: state.vehicles.map(v =>
            v.id === veh.id
              ? { ...v, routeCoords: osrmRoute, routeIndex: nearestIndex }
              : v
          ),
        }
        emit()
        return osrmRoute
      }).catch((error) => {
        console.log(`OSRM failed for vehicle ${veh.id}, keeping fallback route:`, error)
        // Silently keep fallback route - no more "standing still"
        return fallback
      })

      pendingRoutes.set(veh.id, routePromise)
    }

    // --- Move vehicles (speed-scaled) ---
    let anyVehicleMoved = false
    let updatedVehicles = state.vehicles.map((v) => {
      if (v.status === "preparing") {
        // Handle preparation countdown - start moving as soon as route is ready
        const newPrepTime = (v.preparationTimeRemaining || 0) - gameMinutesDelta
        const hasRoute = v.routeCoords.length > 0
        
        // Start moving immediately if route is ready, don't wait for prep time
        if (hasRoute) {
          console.log(`Vehicle ${v.id} has route, starting movement immediately`)
          return {
            ...v,
            status: "dispatched" as VehicleStatus,
            preparationTimeRemaining: undefined
          }
        }
        
        if (newPrepTime <= 0) {
          // Preparation time is up, but we wait for OSRM route before dispatching
          return { ...v, preparationTimeRemaining: 0 }
        }
        return { ...v, preparationTimeRemaining: newPrepTime }
      }
      if (v.status === "dispatched") {
        // Only move if we have a valid OSRM route
        if (v.routeCoords.length === 0) return v
        anyVehicleMoved = true
        const moved = moveVehicleAlongRoute(v, state.gameSpeed)
        if (moved.routeIndex >= moved.routeCoords.length - 1) {
          const mission = state.missions.find((m) => m.id === v.missionId)
          // Park offset: fan out vehicles around mission site (~20m apart)
          const dispatchedToSameMission = state.vehicles.filter(
            (vv) => vv.missionId === v.missionId && vv.id !== v.id && vv.status === "working"
          ).length
          const angle = (dispatchedToSameMission * Math.PI * 0.6) + (Math.PI * 0.25)
          const parkDist = 0.00025 // ~25m offset
          const parkedPos = {
            lat: moved.position.lat + Math.cos(angle) * parkDist,
            lng: moved.position.lng + Math.sin(angle) * parkDist,
          }
          return {
            ...moved,
            position: parkedPos,
            status: "working" as VehicleStatus,
            workTimeRemaining: mission?.workDuration ?? 8,
          }
        }
        return moved
      }

      if (v.status === "working") {
        // Work time decreases by game minutes elapsed this tick
        const remaining = v.workTimeRemaining - gameMinutesDelta
        if (remaining <= 0) {
          const building = state.buildings.find((b) => b.id === v.buildingId)
          if (building) {
            // Give an immediate fallback route so vehicle starts returning instantly
            const fallbackReturn = fallbackRoute(v.position, building.position)
            // Also fetch real route in background
            const returnPromise = getRouteQueued(v.position, building.position).then((routeCoords: LatLng[]) => {
              applyRouteToVehicle(v.id, routeCoords)
              return routeCoords
            })
            pendingRoutes.set(v.id, returnPromise)

            return {
              ...v,
              status: "returning" as VehicleStatus,
              workTimeRemaining: 0,
              routeCoords: fallbackReturn,
              routeIndex: 0,
            }
          }
          return { ...v, status: "idle" as VehicleStatus, workTimeRemaining: 0, routeCoords: [], routeIndex: 0 }
        }
        return { ...v, workTimeRemaining: remaining }
      }

      if (v.status === "returning") {
        if (v.routeCoords.length === 0) return v
        anyVehicleMoved = true
        const moved = moveVehicleAlongRoute(v, state.gameSpeed)
        if (moved.routeIndex >= moved.routeCoords.length - 1) {
          const building = state.buildings.find((b) => b.id === v.buildingId)
          return {
            ...moved,
            status: "idle" as VehicleStatus,
            position: building ? { ...building.position } : moved.position,
            routeCoords: [],
            routeIndex: 0,
            missionId: undefined,
          }
        }
        return moved
      }

      return v
    })

    // --- Update missions (delta-based) ---
    const updatedMissions = state.missions
      .map((m) => {
        if (m.status === "completed" || m.status === "failed") return m

        const newTime = Math.max(0, m.timeRemaining - gameMinutesDelta)

        // Check if all dispatched vehicles finished working
        if (m.status === "dispatched") {
          const dispVehicles = updatedVehicles.filter((v) => v.missionId === m.id)
          const allDone =
            dispVehicles.length > 0 &&
            dispVehicles.every((v) => v.status === "returning" || v.status === "idle")
          if (allDone) {
            newMoney += m.reward
            completed++
            return { ...m, status: "completed" as const, timeRemaining: newTime }
          }
        }

        if (newTime <= 0) {
          newMoney -= m.penalty
          failed++
          const failedVehIds = new Set(m.dispatchedVehicles)
          updatedVehicles = updatedVehicles.map((v) => {
            if (failedVehIds.has(v.id) && v.status !== "idle") {
              const building = state.buildings.find((b) => b.id === v.buildingId)
              if (building && (v.status === "dispatched" || v.status === "working")) {
                // Give an immediate fallback route for return
                const fallbackReturn = fallbackRoute(v.position, building.position)
                const returnPromise = getRouteQueued(v.position, building.position).then((routeCoords: LatLng[]) => {
                  applyRouteToVehicle(v.id, routeCoords)
                  return routeCoords
                })
                pendingRoutes.set(v.id, returnPromise)

                return {
                  ...v,
                  status: "returning" as VehicleStatus,
                  routeCoords: fallbackReturn,
                  routeIndex: 0,
                  workTimeRemaining: 0,
                }
              }
            }
            return v
          })
          return { ...m, status: "failed" as const, timeRemaining: 0 }
        }

        return { ...m, timeRemaining: newTime }
      })
      .filter((m) => {
        if (m.status === "completed" || m.status === "failed") {
          const age = state.gameTime - m.createdAt
          return age < m.timeLimit + 20
        }
        return true
      })

    const isGameOver = newMoney < 0

    if (isGameOver) {
      stopMissionSpawnTimer()
    }

    // Sync buildings only when vehicle status/assignment changed (not just position)
    // Compare vehicle statuses to detect structural changes vs mere movement
    const vehicleStatusChanged = updatedVehicles.some((v, i) => {
      const old = state.vehicles[i]
      if (!old) return true
      return v.status !== old.status || v.missionId !== old.missionId || v.buildingId !== old.buildingId
    }) || updatedVehicles.length !== state.vehicles.length
    const nextBuildings = vehicleStatusChanged ? syncBuildingsWithVehicles(updatedVehicles) : state.buildings

    state = {
      ...state,
      money: newMoney,
      missions: updatedMissions,
      vehicles: updatedVehicles,
      buildings: nextBuildings,
      missionsCompleted: completed,
      missionsFailed: failed,
      gameTime: newGameTime,
      gameOver: isGameOver,
    }
    emit()
  }, [])

  const updateTime = useCallback(() => {
    // Delta-based time update: only advances by the real time elapsed since
    // the last call, scaled by the *current* speed. This avoids jumps when
    // switching speed modes because we never recompute the entire elapsed time.
    if (!state.isPaused && !state.gameOver) {
      const now = Date.now()
      const realDeltaMs = now - lastTimeUpdateRealTime
      lastTimeUpdateRealTime = now
      const gameMinutesDelta = (realDeltaMs / 1000) * state.gameSpeed
      const newGameTime = state.gameTime + gameMinutesDelta * 60000
      state = { ...state, gameTime: newGameTime }
      emit()
    }
  }, [])

  const clearNewMissions = useCallback(() => {
    state = { ...state, newMissions: [], unreadMissionCount: 0 }
    emit()
  }, [])

  const tick = useCallback(() => {
    if (state.isPaused || state.gameOver) return

    const now = Date.now()
    const realDeltaMs = now - lastTickRealTime
    lastTickRealTime = now
    const gameMinutesDelta = (realDeltaMs / 1000) * state.gameSpeed
    const newGameTime = state.gameTime + gameMinutesDelta * 60000

    let newMoney = state.money
    let completed = state.missionsCompleted
    let failed = state.missionsFailed

    // --- Move vehicles (speed-scaled) ---
    let anyVehicleMoved = false
    let updatedVehicles = state.vehicles.map((v) => {
      if (v.status === "preparing") {
        // Handle preparation countdown - start moving as soon as route is ready
        const newPrepTime = (v.preparationTimeRemaining || 0) - gameMinutesDelta
        const hasRoute = v.routeCoords.length > 0
        
        // Start moving immediately if route is ready, don't wait for prep time
        if (hasRoute) {
          console.log(`Vehicle ${v.id} has route, starting movement immediately`)
          return {
            ...v,
            status: "dispatched" as VehicleStatus,
            preparationTimeRemaining: undefined
          }
        }
        
        if (newPrepTime <= 0) {
          // Preparation time is up, but we wait for OSRM route before dispatching
          return { ...v, preparationTimeRemaining: 0 }
        }
        return { ...v, preparationTimeRemaining: newPrepTime }
      }
      if (v.status === "dispatched") {
        // Only move if we have a valid OSRM route
        if (v.routeCoords.length === 0) return v
        anyVehicleMoved = true
        const moved = moveVehicleAlongRoute(v, state.gameSpeed)
        if (moved.routeIndex >= moved.routeCoords.length - 1) {
          const mission = state.missions.find((m) => m.id === v.missionId)
          // Park offset: fan out vehicles around mission site (~20m apart)
          const dispatchedToSameMission = state.vehicles.filter(
            (vv) => vv.missionId === v.missionId && vv.id !== v.id && vv.status === "working"
          ).length
          const angle = (dispatchedToSameMission * Math.PI * 0.6) + (Math.PI * 0.25)
          const parkDist = 0.00025 // ~25m offset
          const parkedPos = {
            lat: moved.position.lat + Math.cos(angle) * parkDist,
            lng: moved.position.lng + Math.sin(angle) * parkDist,
          }
          return {
            ...moved,
            position: parkedPos,
            status: "working" as VehicleStatus,
            workTimeRemaining: mission?.workDuration ?? 8,
          }
        }
        return moved
      }

      if (v.status === "working") {
        // Work time decreases by game minutes elapsed this tick
        const remaining = v.workTimeRemaining - gameMinutesDelta
        if (remaining <= 0) {
          const building = state.buildings.find((b) => b.id === v.buildingId)
          if (building) {
            // Give an immediate fallback route so vehicle starts returning instantly
            const fallbackReturn = fallbackRoute(v.position, building.position)
            // Also fetch real route in background
            const returnPromise = getRouteQueued(v.position, building.position).then((routeCoords: LatLng[]) => {
              applyRouteToVehicle(v.id, routeCoords)
              return routeCoords
            })
            pendingRoutes.set(v.id, returnPromise)

            return {
              ...v,
              status: "returning" as VehicleStatus,
              workTimeRemaining: 0,
              routeCoords: fallbackReturn,
              routeIndex: 0,
            }
          }
          return { ...v, status: "idle" as VehicleStatus, workTimeRemaining: 0, routeCoords: [], routeIndex: 0 }
        }
        return { ...v, workTimeRemaining: remaining }
      }

      if (v.status === "returning") {
        if (v.routeCoords.length === 0) return v
        anyVehicleMoved = true
        const moved = moveVehicleAlongRoute(v, state.gameSpeed)
        if (moved.routeIndex >= moved.routeCoords.length - 1) {
          const building = state.buildings.find((b) => b.id === v.buildingId)
          return {
            ...moved,
            status: "idle" as VehicleStatus,
            position: building ? { ...building.position } : moved.position,
            routeCoords: [],
            routeIndex: 0,
            missionId: undefined,
          }
        }
        return moved
      }

      return v
    })

    // --- Update missions (delta-based) ---
    const updatedMissions = state.missions
      .map((m) => {
        if (m.status === "completed" || m.status === "failed") return m

        const newTime = Math.max(0, m.timeRemaining - gameMinutesDelta)

        // Check if all dispatched vehicles finished working
        if (m.status === "dispatched") {
          const dispVehicles = updatedVehicles.filter((v) => v.missionId === m.id)
          const allDone =
            dispVehicles.length > 0 &&
            dispVehicles.every((v) => v.status === "returning" || v.status === "idle")
          if (allDone) {
            newMoney += m.reward
            completed++
            return { ...m, status: "completed" as const, timeRemaining: newTime }
          }
        }

        if (newTime <= 0) {
          newMoney -= m.penalty
          failed++
          const failedVehIds = new Set(m.dispatchedVehicles)
          updatedVehicles = updatedVehicles.map((v) => {
            if (failedVehIds.has(v.id) && v.status !== "idle") {
              const building = state.buildings.find((b) => b.id === v.buildingId)
              if (building && (v.status === "dispatched" || v.status === "working")) {
                // Give an immediate fallback route for return
                const fallbackReturn = fallbackRoute(v.position, building.position)
                const returnPromise = getRouteQueued(v.position, building.position).then((routeCoords: LatLng[]) => {
                  applyRouteToVehicle(v.id, routeCoords)
                  return routeCoords
                })
                pendingRoutes.set(v.id, returnPromise)

                return {
                  ...v,
                  status: "returning" as VehicleStatus,
                  routeCoords: fallbackReturn,
                  routeIndex: 0,
                  workTimeRemaining: 0,
                }
              }
            }
            return v
          })
          return { ...m, status: "failed" as const, timeRemaining: 0 }
        }

        return { ...m, timeRemaining: newTime }
      })
      .filter((m) => {
        if (m.status === "completed" || m.status === "failed") {
          const age = state.gameTime - m.createdAt
          return age < m.timeLimit + 20
        }
        return true
      })

    const isGameOver = newMoney < 0

    if (isGameOver) {
      stopMissionSpawnTimer()
    }

    // Sync buildings only when vehicle status/assignment changed (not just position)
    // Compare vehicle statuses to detect structural changes vs mere movement
    const vehicleStatusChanged = updatedVehicles.some((v, i) => {
      const old = state.vehicles[i]
      if (!old) return true
      return v.status !== old.status || v.missionId !== old.missionId || v.buildingId !== old.buildingId
    }) || updatedVehicles.length !== state.vehicles.length
    const nextBuildings = vehicleStatusChanged ? syncBuildingsWithVehicles(updatedVehicles) : state.buildings

    state = {
      ...state,
      money: newMoney,
      missions: updatedMissions,
      vehicles: updatedVehicles,
      buildings: nextBuildings,
      missionsCompleted: completed,
      missionsFailed: failed,
      gameTime: newGameTime,
      gameOver: isGameOver,
    }
    emit()
  }, [])

  return {
    placeBuilding,
    upgradeBuilding,
    hireStaff,
    purchaseVehicle,
    sellBuilding,
    dispatchVehicle,
    generateMission,
    tick,
    updateTime,
    clearNewMissions,
    markMissionsAsRead: () => {
      state = { ...state, unreadMissionCount: 0 }
      emit()
    },
    setPlacing: (type: BuildingType | null) => {
      state = { ...state, placingBuilding: type }
      emit()
    },
    selectBuilding: (building: Building | null) => {
      state = { ...state, selectedBuilding: building, selectedMission: null }
      emit()
    },
    selectMission: (mission: Mission | null) => {
      state = { ...state, selectedMission: mission, selectedBuilding: null }
      emit()
    },
    openBuildingManager: (building: Building | null) => {
  if (building) {
    const freshBuilding = state.buildings.find((b) => b.id === building.id) || building
    const buildingVehicles = state.vehicles.filter((v) => v.buildingId === freshBuilding.id)

    state = {
      ...state,
      managingBuilding: { ...freshBuilding, vehicles: buildingVehicles },
    }
  } else {
    state = { ...state, managingBuilding: null }
  }
  emit()
},
    togglePause: () => {
      const willUnpause = state.isPaused
      if (willUnpause) {
        // Resync clocks so the first tick/update doesn't include the paused duration
        const now = Date.now()
        lastTickRealTime = now
        lastTimeUpdateRealTime = now
      }
      state = { ...state, isPaused: !state.isPaused }
      emit()

      // Start or stop the mission auto-spawn timer
      if (willUnpause) {
        scheduleNextMissionSpawn()
      } else {
        stopMissionSpawnTimer()
      }
    },
    setGameSpeed: (speed: 1 | 2 | 3) => {
      // Resync clocks so the speed change takes effect cleanly from this moment
      const now = Date.now()
      lastTickRealTime = now
      lastTimeUpdateRealTime = now
      state = { ...state, gameSpeed: speed }
      emit()

      // Reschedule mission spawn timer with new speed
      if (!state.isPaused && !state.gameOver) {
        scheduleNextMissionSpawn()
      }
    },
    setCity: (city: CityConfig) => {
      state = { ...state, city, population: city.population }
      emit()
    },
    startGame: () => {
      const now = Date.now()
      lastTickRealTime = now
      lastTimeUpdateRealTime = now
      state = { 
        ...state, 
        gameTime: now, 
        gameStartTime: now,
        isPaused: false 
      }
      emit()

      // Start mission auto-spawn timer immediately on game start
      scheduleNextMissionSpawn()
    },
    resetGame: () => {
      nextId = 1
      stopMissionSpawnTimer()
      pendingRoutes.clear()
      state = { ...INITIAL_STATE, buildings: [], missions: [], vehicles: [], city: null, newMissions: [], unreadMissionCount: 0 }
      emit()
    }
  }
}
