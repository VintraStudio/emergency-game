"use client"

import { useSyncExternalStore } from "react"
import type {
  GameState,
  Building,
  Mission,
  Vehicle,
  BuildingType,
  BuildingSize,
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

// Tracks real wall-clock time of the last tick so we can compute deltas
let lastTickRealTime = Date.now()
// Tracks real wall-clock time of the last time update for smooth display
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

export function useGameActions() {
  return gameStore
}

// --- Pending route fetches: track in-flight route requests to merge into state safely ---
const pendingRoutes = new Map<string, Promise<LatLng[]>>()

// Safely apply a resolved route to the current state snapshot.
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

// Find the nearest point on route to snap to when upgrading from fallback to OSRM
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
const TARGET_TICKS_TO_COMPLETE = 600

function moveVehicleAlongRoute(v: Vehicle, gameSpeed: number): Vehicle {
  if (v.routeCoords.length === 0 || v.routeIndex >= v.routeCoords.length - 1) {
    return v
  }

  // Base speed: route points per tick
  const basePointsPerTick = Math.max(0.5, v.routeCoords.length / TARGET_TICKS_TO_COMPLETE)
  
  // Detect road type by looking at the angle change between route segments.
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

  const position = { lat: state.city.center.lat + (Math.random() - 0.5) * 0.02, lng: state.city.center.lng + (Math.random() - 0.5) * 0.025 }

  const mission: Mission = {
    id: genId("msn"),
    type,
    title: config.titles[titleIndex],
    description: config.descriptions[titleIndex],
    position,
    requiredBuildings: config.requiredBuildings,
    timeLimit: config.baseTimeLimit,
    timeRemaining: config.baseTimeLimit,
    reward: config.baseReward,
    penalty: config.basePenalty,
    workDuration: config.workDuration,
    status: "pending",
    createdAt: state.gameTime,
    dispatchedVehicles: [],
  }

  state = {
    ...state,
    missions: [...state.missions, mission],
    newMissions: [...state.newMissions, mission],
    unreadMissionCount: state.unreadMissionCount + 1,
  }
  emit()
}

// --- Mission auto-spawn scheduler ---
function scheduleNextMissionSpawn() {
  if (missionSpawnTimer) {
    clearTimeout(missionSpawnTimer)
    missionSpawnTimer = null
  }

  // Random interval between missions (scaled by game speed)
  const baseIntervalMs = 25000 // 25 seconds base
  const speedMultiplier = state.gameSpeed
  const intervalMs = baseIntervalMs / speedMultiplier
  const randomJitterMs = Math.random() * 5000 // ±5 seconds random jitter

  nextMissionSpawnTime = Date.now() + intervalMs + randomJitterMs

  missionSpawnTimer = setTimeout(() => {
    internalGenerateMission()
    scheduleNextMissionSpawn()
  }, intervalMs + randomJitterMs)
}

function stopMissionSpawnTimer() {
  if (missionSpawnTimer) {
    clearTimeout(missionSpawnTimer)
    missionSpawnTimer = null
  }
}

// --- Game actions ---
const dispatchVehicle = (missionId: string) => {
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

  // Start vehicles immediately on fallback routes, upgrade to OSRM in background
  for (const veh of availableVehicles) {
    // 1) Start instantly on fallback route
    const fallback = fallbackRoute(veh.position, mission.position)
    
    state = {
      ...state,
      missions: state.missions.map((m) =>
        m.id === missionId
          ? { ...m, status: "dispatched" as const, dispatchedVehicles: vehicleIds }
          : m,
      ),
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
}

const tick = () => {
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
  let updatedVehicles = state.vehicles.map((v) => {
    if (v.status === "dispatched") {
      // Only move if we have a valid route
      if (v.routeCoords.length === 0) return v
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

    // Fetch real OSRM road routes asynchronously; once resolved, set status to "dispatched"
    // and start moving with the actual road geometry ONLY when route is ready
    for (const veh of availableVehicles) {
      console.log("[v0] Fetching OSRM route for vehicle", veh.id, "from", veh.position, "to", mission.position)
      const routePromise = fetchRoute(veh.position, mission.position).then((routeCoords) => {
        console.log("[v0] Route received for", veh.id, "with", routeCoords.length, "coords")
        // Read current vehicle state to preserve progress
        const currentVeh = state.vehicles.find((v) => v.id === veh.id)
        if (!currentVeh) {
          console.log("[v0] Vehicle", veh.id, "no longer exists in state, skipping route apply")
          pendingRoutes.delete(veh.id)
          return routeCoords
        }
        
        // Accept route if vehicle is preparing OR dispatched-without-route
        if (currentVeh.status !== "preparing" && !(currentVeh.status === "dispatched" && currentVeh.routeCoords.length === 0)) {
          console.log("[v0] Vehicle", veh.id, "status is", currentVeh.status, "skipping route")
          pendingRoutes.delete(veh.id)
          return routeCoords
        }

        console.log("[v0] Applying route to vehicle", veh.id, "status was:", currentVeh.status)
        // Update vehicle with real route and change status to "dispatched"
        const updatedVehicles = state.vehicles.map((v) =>
          v.id === veh.id
            ? { 
                ...v, 
                status: "dispatched" as VehicleStatus,
                routeCoords: routeCoords, 
                routeIndex: 0,
                preparationTimeRemaining: undefined
              }
            : v,
        )
        state = {
          ...state,
          vehicles: updatedVehicles,
          buildings: syncBuildingsWithVehicles(updatedVehicles),
        }
        pendingRoutes.delete(veh.id)
        emit()
        
        return routeCoords
      }).catch((err) => {
        console.warn("[v0] Route fetch error for vehicle", veh.id, err)
        // Apply fallback interpolated route so the vehicle still moves
        const fallback = interpolateRoute(veh.position, mission.position)
        const updatedVehicles = state.vehicles.map((v) =>
          v.id === veh.id
            ? { 
                ...v, 
                status: "dispatched" as VehicleStatus,
                routeCoords: fallback, 
                routeIndex: 0,
                preparationTimeRemaining: undefined
              }
            : v,
        )
        state = {
          ...state,
          vehicles: updatedVehicles,
          buildings: syncBuildingsWithVehicles(updatedVehicles),
        }
        pendingRoutes.delete(veh.id)
        emit()
        return fallback
      })
      pendingRoutes.set(veh.id, routePromise)
    }
  }, [])

  // Sync buildings only when vehicle status/assignment changed (not just position)
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
}

const updateTime = () => {
  // Delta-based time update: only advances by the real time elapsed since
  // the last call, scaled by the *current* speed. This avoids jumps when
  // switching speed modes because we never recompute the entire elapsed time.
  if (!state.isPaused && !state.gameOver) {
    const now = Date.now()
    const realDeltaMs = now - lastTimeUpdateRealTime
    lastTimeUpdateRealTime = now
    const gameMinutesDelta = (realDeltaMs / 1000) * state.gameSpeed
    const newGameTime = state.gameTime + gameMinutesDelta * 60000 // add as ms offset

    let newMoney = state.money
    let completed = state.missionsCompleted
    let failed = state.missionsFailed

    // --- Move vehicles (speed-scaled) ---
    let anyVehicleMoved = false
    let updatedVehicles = state.vehicles.map((v) => {
      if (v.status === "preparing") {
        // Handle preparation countdown - do NOT move until OSRM route is ready
        const newPrepTime = (v.preparationTimeRemaining || 0) - gameMinutesDelta
        if (newPrepTime <= -5) {
          // Route fetch is taking too long (5+ extra game-minutes), apply fallback
          const mission = state.missions.find((m) => m.id === v.missionId)
          if (mission) {
            console.log("[v0] Preparing timeout for", v.id, "- using fallback route")
            const fallback = interpolateRoute(v.position, mission.position)
            return {
              ...v,
              status: "dispatched" as VehicleStatus,
              routeCoords: fallback,
              routeIndex: 0,
              preparationTimeRemaining: undefined,
            }
          }
        }
        return { ...v, preparationTimeRemaining: Math.min(newPrepTime, 0) }
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

const clearNewMissions = () => {
  state = { ...state, newMissions: [], unreadMissionCount: 0 }
  emit()
}

const gameStore = {
  dispatchVehicle,
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
      // Resync clocks so that the first tick/update doesn't include the paused duration
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
    // Resync clocks so that speed change takes effect cleanly from this moment
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
  },
  placeBuilding: (type: BuildingType, position: LatLng, size: BuildingSize = "small") => {
    const config = BUILDING_CONFIGS[type]
    if (!config) return

    const cost = size === "small" ? config.smallCost : config.largeCost
    if (state.money < cost) return

    // Create initial vehicles for the building
    const initialVehicles: Vehicle[] = []
    for (const vehicleConfig of config.vehicles) {
      for (let i = 0; i < vehicleConfig.count; i++) {
        const vehicle: Vehicle = {
          id: genId("veh"),
          type: vehicleConfig.type,
          buildingId: "", // Will be set after building is created
          position,
          status: "idle",
          routeCoords: [],
          routeIndex: 0,
          workTimeRemaining: 0,
        }
        initialVehicles.push(vehicle)
      }
    }

    const buildingId = genId("bld")
    
    // Update vehicles with the building ID
    initialVehicles.forEach(v => v.buildingId = buildingId)

    const building: Building = {
      id: buildingId,
      type,
      size,
      level: 1,
      name: config.name,
      position,
      vehicles: initialVehicles,
      staff: Math.floor((size === "small" ? 5 : 10) * 0.6), // Start with 60% staff
      maxStaff: size === "small" ? 5 : 10,
      upgrades: [],
      cost,
      efficiency: 1.0,
    }

    state = {
      ...state,
      money: state.money - cost,
      buildings: [...state.buildings, building],
      vehicles: [...state.vehicles, ...initialVehicles],
      placingBuilding: null,
    }
    emit()
  },
  upgradeBuilding: (buildingId: string) => {
    const building = state.buildings.find((b) => b.id === buildingId)
    if (!building || building.level >= 3) return

    const config = BUILDING_CONFIGS[building.type]
    const upgradeCost = config.upgradeCost
    if (state.money < upgradeCost) return

    state = {
      ...state,
      money: state.money - upgradeCost,
      buildings: state.buildings.map((b) =>
        b.id === buildingId ? { ...b, level: b.level + 1 } : b
      ),
    }
    emit()
  },
  sellBuilding: (buildingId: string) => {
    const building = state.buildings.find((b) => b.id === buildingId)
    if (!building) return

    const config = BUILDING_CONFIGS[building.type]
    const originalCost = building.size === "small" ? config.smallCost : config.largeCost
    const sellPrice = Math.floor(originalCost * 0.7)
    
    // Remove all vehicles from this building
    const updatedVehicles = state.vehicles.filter((v) => v.buildingId !== buildingId)

    state = {
      ...state,
      money: state.money + sellPrice,
      buildings: state.buildings.filter((b) => b.id !== buildingId),
      vehicles: updatedVehicles,
    }
    emit()
  },
  hireStaff: (buildingId: string) => {
    const building = state.buildings.find((b) => b.id === buildingId)
    if (!building || building.staff >= building.maxStaff) return

    const config = BUILDING_CONFIGS[building.type]
    if (state.money < config.staffCost) return

    state = {
      ...state,
      money: state.money - config.staffCost,
      buildings: state.buildings.map((b) =>
        b.id === buildingId ? { ...b, staff: b.staff + 1 } : b
      ),
    }
    emit()
  },
  purchaseVehicle: (buildingId: string) => {
    const building = state.buildings.find((b) => b.id === buildingId)
    if (!building) return

    const config = BUILDING_CONFIGS[building.type]
    if (state.money < config.vehicleCost) return

    const vehicleType = config.vehicles[0]?.type || "Vehicle"
    const vehicle: Vehicle = {
      id: genId("veh"),
      type: vehicleType,
      buildingId,
      position: building.position,
      status: "idle",
      routeCoords: [],
      routeIndex: 0,
      workTimeRemaining: 0,
    }

    state = {
      ...state,
      money: state.money - config.vehicleCost,
      vehicles: [...state.vehicles, vehicle],
    }
    emit()
  }
}

export default gameStore
