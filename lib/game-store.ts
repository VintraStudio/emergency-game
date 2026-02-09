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
  gameTime: Date.now(),  // Start with current real time
  gameStartTime: Date.now(),  // When game was started
  gameSpeed: 1,         // Normal speed
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

// Vehicle movement: advance along routeCoords by a fixed number of points per tick
const ROUTE_POINTS_PER_TICK = 3

function moveVehicleAlongRoute(v: Vehicle): Vehicle {
  if (v.routeCoords.length === 0 || v.routeIndex >= v.routeCoords.length - 1) {
    return v
  }

  const newIndex = Math.min(v.routeIndex + ROUTE_POINTS_PER_TICK, v.routeCoords.length - 1)
  const pos = v.routeCoords[newIndex]

  return {
    ...v,
    position: { ...pos },
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
  
  return randomPositionInCity(city); 
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
    const currentTime = Date.now()
    const realElapsed = currentTime - state.gameStartTime
    const gameElapsed = realElapsed * 60 * state.gameSpeed
    const currentGameTime = state.gameStartTime + gameElapsed

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
      createdAt: currentGameTime,
    }

    state = { ...state, missions: [...state.missions, mission] }
    emit()
  }, [])

  const tick = useCallback(() => {
    if (state.isPaused || state.gameOver) return

    const currentTime = Date.now()
    const realElapsed = currentTime - state.gameStartTime
    // 1 real second = 1 game minute at 1x speed
    const gameElapsed = realElapsed * 60 * state.gameSpeed
    const newGameTime = state.gameStartTime + gameElapsed

    console.log(`[Tick] Running - gameTime: ${new Date(newGameTime).toLocaleTimeString()}, speed: ${state.gameSpeed}`)

    let newMoney = state.money
    let completed = state.missionsCompleted
    let failed = state.missionsFailed

    // --- Move vehicles ---
    console.log(`[Tick] Processing ${state.vehicles.length} vehicles`)
    let updatedVehicles = state.vehicles.map((v) => {
      console.log(`[Tick] Vehicle ${v.id}: status=${v.status}, routeLength=${v.routeCoords.length}`)
      if (v.status === "dispatched") {
        if (v.routeCoords.length === 0) return v // still waiting for route
        const moved = moveVehicleAlongRoute(v)
        console.log(`[Vehicle] ${v.id} moved from index ${v.routeIndex} to ${moved.routeIndex}`)
        // Check if arrived at destination
        if (moved.routeIndex >= moved.routeCoords.length - 1) {
          const mission = state.missions.find((m) => m.id === v.missionId)
          console.log(`[Vehicle] ${v.id} arrived at mission:`, mission?.id)
          return {
            ...moved,
            status: "working" as VehicleStatus,
            workTimeRemaining: mission?.workDuration ?? 8,
          }
        }
        return moved
      }

      if (v.status === "working") {
        const remaining = v.workTimeRemaining - 1
        if (remaining <= 0) {
          // Done working - fetch return route async
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
              routeCoords: [], // will be filled by async call
              routeIndex: 0,
            }
          }
          return { ...v, status: "idle" as VehicleStatus, workTimeRemaining: 0, routeCoords: [], routeIndex: 0 }
        }
        return { ...v, workTimeRemaining: remaining }
      }

      if (v.status === "returning") {
        if (v.routeCoords.length === 0) return v // still waiting for return route
        const moved = moveVehicleAlongRoute(v)
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

    // --- Update missions ---
    const updatedMissions = state.missions
      .map((m) => {
        if (m.status === "completed" || m.status === "failed") return m

        // Calculate time elapsed in minutes based on game speed
        // gameElapsed is already in game minutes (real seconds * 60)
        const elapsedMinutes = (gameElapsed / 1000)
        const newTime = Math.max(0, m.timeRemaining - elapsedMinutes)

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
    // Update game time based on current speed
    if (!state.isPaused && !state.gameOver) {
      const currentTime = Date.now()
      const realElapsed = currentTime - state.gameStartTime
      // 1 real second = 1 game minute at 1x speed
      const gameElapsed = realElapsed * 60 * state.gameSpeed
      const newGameTime = state.gameStartTime + gameElapsed
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
      state = { ...state, isPaused: !state.isPaused }
      emit()
    },
    setGameSpeed: (speed: 1 | 2 | 3) => {
      state = { ...state, gameSpeed: speed }
      emit()
    },
    setCity: (city: CityConfig) => {
      state = { ...state, city, population: city.population }
      emit()
    },
    startGame: () => {
      // Set start time when game starts for first time
      const now = Date.now()
      console.log(`[Game] Starting game at:`, new Date(now).toLocaleTimeString())
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
