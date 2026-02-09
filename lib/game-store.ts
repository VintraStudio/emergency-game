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
}

// Tracks the real wall-clock time of the last tick so we can compute deltas
let lastTickRealTime = Date.now()
// Tracks the real wall-clock time of the last time update for smooth display
let lastTimeUpdateRealTime = Date.now()

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

// --- OSRM routing ---
// Uses the public OSRM demo server for route calculation
async function fetchRoute(from: LatLng, to: LatLng): Promise<LatLng[]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
    const res = await fetch(url)
    const data = await res.json()
    if (data.routes && data.routes.length > 0) {
      const coords = data.routes[0].geometry.coordinates as [number, number][]
      return coords.map(([lng, lat]) => ({ lat, lng }))
    }
  } catch (e) {
    console.warn("[v0] OSRM route fetch failed, using direct path", e)
  }
  // Fallback: straight line with intermediate points
  return interpolateRoute(from, to)
}

// Fallback interpolation if OSRM is unavailable
function interpolateRoute(from: LatLng, to: LatLng): LatLng[] {
  const steps = 20
  const points: LatLng[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    points.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    })
  }
  return points
}

// Vehicle movement: advance along routeCoords, scaled by game speed.
// OSRM routes can have 100-500+ coordinate points; we advance several points
// per tick (500ms) so vehicles visibly move. At 1x speed a vehicle should
// traverse a typical city route (~200 points) in roughly 15-20 seconds.
const BASE_ROUTE_POINTS_PER_TICK = 8

function moveVehicleAlongRoute(v: Vehicle, gameSpeed: number): Vehicle {
  if (v.routeCoords.length === 0 || v.routeIndex >= v.routeCoords.length - 1) {
    return v
  }

  const pointsToMove = BASE_ROUTE_POINTS_PER_TICK * gameSpeed
  const newIndex = Math.min(v.routeIndex + pointsToMove, v.routeCoords.length - 1)
  // Floor the index to access valid array positions; keep fractional for smooth accumulation
  const pos = v.routeCoords[Math.floor(newIndex)]

  return {
    ...v,
    position: { lat: pos.lat, lng: pos.lng },
    routeIndex: newIndex,
  }
}

// Generate a smart position based on mission type and city structure
function smartMissionPosition(city: CityConfig, missionType: MissionType, buildings: Building[]): LatLng {

  // 1. Sjanse for å spawne nær eksisterende bygninger (f.eks. 70% sjanse)
  if (buildings.length > 0 && Math.random() < 0.7) {
    const randomBuilding = buildings[Math.floor(Math.random() * buildings.length)];
    
    // Spawn innenfor en radius på ca 1-1.5 km (0.015 grader)
    return {
      lat: randomBuilding.position.lat + (Math.random() - 0.5) * 0.03,
      lng: randomBuilding.position.lng + (Math.random() - 0.5) * 0.03
    };
  }

  // 2. Fallback til den gamle logikken (spredt i hele byen) hvis ingen bygg 
  // eller hvis den faller i de resterende 30%
  const cityCenter = {
    lat: (city.bounds.north + city.bounds.south) / 2,
    lng: (city.bounds.east + city.bounds.west) / 2
  };
  
  // Define road network area (main corridors)
  const roadArea = {
    north: city.bounds.north * 0.9,
    south: city.bounds.south * 1.1,
    east: city.bounds.east * 0.9,
    west: city.bounds.west * 1.1
  }
  
  // Water areas (avoid for most missions)
  const waterAreas = [
    { north: city.bounds.north * 0.95, south: city.bounds.north * 0.85, east: city.bounds.east * 0.8, west: city.bounds.west * 1.2 },
    { north: city.bounds.south * 1.15, south: city.bounds.south * 1.05, east: city.bounds.east * 0.8, west: city.bounds.west * 1.2 }
  ]
  
  let position: LatLng
  
  switch (missionType) {
    case "traffic-accident":
      // Traffic accidents happen on roads
      position = {
        lat: roadArea.south + Math.random() * (roadArea.north - roadArea.south),
        lng: roadArea.west + Math.random() * (roadArea.east - roadArea.west)
      }
      break
      
    case "fire":
      // Fires can happen anywhere but avoid water
      do {
        position = randomPositionInCity(city)
      } while (waterAreas.some(water => 
        position.lat >= water.south && position.lat <= water.north &&
        position.lng >= water.west && position.lng <= water.east
      ))
      break
      
    case "medical-emergency":
      // Medical emergencies in populated areas (city center)
      const radius = Math.min(
        (city.bounds.north - city.bounds.south) * 0.3,
        (city.bounds.east - city.bounds.west) * 0.3
      )
      position = {
        lat: cityCenter.lat + (Math.random() - 0.5) * radius * 2,
        lng: cityCenter.lng + (Math.random() - 0.5) * radius * 2
      }
      break
      
    case "crime":
      // Crime happens in urban areas, avoid water
      do {
        position = {
          lat: city.bounds.south + Math.random() * (city.bounds.north - city.bounds.south),
          lng: city.bounds.west + Math.random() * (city.bounds.east - city.bounds.west)
        }
      } while (waterAreas.some(water => 
        position.lat >= water.south && position.lat <= water.north &&
        position.lng >= water.west && position.lng <= water.east
      ))
      break
      
    case "infrastructure":
      // Infrastructure issues near roads and city edges
      const edgeBias = Math.random() > 0.5
      position = {
        lat: edgeBias 
          ? (Math.random() > 0.5 ? city.bounds.north * 0.95 : city.bounds.south * 1.05)
          : roadArea.south + Math.random() * (roadArea.north - roadArea.south),
        lng: edgeBias
          ? roadArea.west + Math.random() * (roadArea.east - roadArea.west)
          : (Math.random() > 0.5 ? city.bounds.east * 0.95 : city.bounds.west * 1.05)
      }
      break
      
    default:
      position = randomPositionInCity(city)
  }
  
  return position
}

// Generate a random position within city bounds (fallback)
function randomPositionInCity(city: CityConfig): LatLng {
  return {
    lat: city.bounds.south + Math.random() * (city.bounds.north - city.bounds.south),
    lng: city.bounds.west + Math.random() * (city.bounds.east - city.bounds.west),
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

    console.log(`[Dispatch] Starting dispatch for mission:`, missionId, mission.type)

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
          console.log(`[Dispatch] Found vehicle:`, idle.id, `from building:`, bld.type)
          break
        }
      }
    }

    if (availableVehicles.length === 0) {
      console.log(`[Dispatch] No available vehicles for mission:`, missionId)
      return
    }

    const vehicleIds = availableVehicles.map((v) => v.id)
    console.log(`[Dispatch] Dispatching vehicles:`, vehicleIds)

    // Mark as dispatched immediately, routes will be fetched async
    state = {
      ...state,
      missions: state.missions.map((m) =>
        m.id === missionId
          ? { ...m, status: "dispatched" as const, dispatchedVehicles: vehicleIds }
          : m,
      ),
      vehicles: state.vehicles.map((v) => {
        if (vehicleIds.includes(v.id)) {
          return { ...v, status: "dispatched" as VehicleStatus, missionId: mission.id }
        }
        return v
      }),
    }
    emit()

    // Fetch routes asynchronously for each vehicle
    for (const veh of availableVehicles) {
      fetchRoute(veh.position, mission.position).then((routeCoords) => {
        console.log(`[Route] Fetched route for vehicle:`, veh.id, `points:`, routeCoords.length)
        state = {
          ...state,
          vehicles: state.vehicles.map((v) =>
            v.id === veh.id ? { ...v, routeCoords, routeIndex: 0 } : v,
          ),
        }
        emit()
      })
    }
  }, [])

  const generateMission = useCallback(() => {
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
    
    // Debug: Log mission spawn location
    console.log(`[Mission] ${type} spawned at:`, {
      lat: position.lat.toFixed(4),
      lng: position.lng.toFixed(4),
      missionType: type,
      activeMissions: state.missions.filter(m => m.status === "pending" || m.status === "dispatched").length
    })
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

    state = { ...state, missions: [...state.missions, mission] }
    emit()
  }, [])

  const tick = useCallback(() => {
    if (state.isPaused || state.gameOver) return

    const now = Date.now()
    const realDeltaMs = now - lastTickRealTime
    lastTickRealTime = now
    // Also sync the time-update clock so they don't diverge
    lastTimeUpdateRealTime = now

    // Game minutes elapsed this tick: realDeltaMs converted to seconds, then
    // 1 real second = 1 game minute, multiplied by speed
    const gameMinutesDelta = (realDeltaMs / 1000) * state.gameSpeed
    const newGameTime = state.gameTime + gameMinutesDelta * 60000 // add as ms offset

    let newMoney = state.money
    let completed = state.missionsCompleted
    let failed = state.missionsFailed

    // --- Move vehicles (speed-scaled) ---
    let updatedVehicles = state.vehicles.map((v) => {
      if (v.status === "dispatched") {
        if (v.routeCoords.length === 0) return v // still waiting for route
        const moved = moveVehicleAlongRoute(v, state.gameSpeed)
        if (moved.routeIndex >= moved.routeCoords.length - 1) {
          const mission = state.missions.find((m) => m.id === v.missionId)
          return {
            ...moved,
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
            fetchRoute(v.position, building.position).then((routeCoords) => {
              state = {
                ...state,
                vehicles: state.vehicles.map((sv) =>
                  sv.id === v.id ? { ...sv, routeCoords, routeIndex: 0 } : sv,
                ),
              }
              emit()
            })
            return {
              ...v,
              status: "returning" as VehicleStatus,
              workTimeRemaining: 0,
              routeCoords: [],
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
                fetchRoute(v.position, building.position).then((routeCoords) => {
                  state = {
                    ...state,
                    vehicles: state.vehicles.map((sv) =>
                      sv.id === v.id ? { ...sv, routeCoords, routeIndex: 0 } : sv,
                    ),
                  }
                  emit()
                })
                return {
                  ...v,
                  status: "returning" as VehicleStatus,
                  routeCoords: [],
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

    state = {
      ...state,
      money: newMoney,
      missions: updatedMissions,
      vehicles: updatedVehicles,
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
        const fresh = state.buildings.find((b) => b.id === building.id) || building
        state = { ...state, managingBuilding: fresh }
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
    },
    setGameSpeed: (speed: 1 | 2 | 3) => {
      // Resync clocks so the speed change takes effect cleanly from this moment
      const now = Date.now()
      lastTickRealTime = now
      lastTimeUpdateRealTime = now
      state = { ...state, gameSpeed: speed }
      emit()
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
    },
    resetGame: () => {
      nextId = 1
      state = { ...INITIAL_STATE, buildings: [], missions: [], vehicles: [], city: null }
      emit()
    },
  }
}
