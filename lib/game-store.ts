"use client"

import { useSyncExternalStore, useCallback } from "react"
import type {
  GameState,
  Building,
  Mission,
  Vehicle,
  BuildingType,
  MissionType,
  Position,
  VehicleStatus,
} from "./game-types"
import { BUILDING_CONFIGS, MISSION_CONFIGS } from "./game-types"
import { findNearestNode, findPath } from "./road-network"

let nextId = 1
function genId(prefix: string) {
  return `${prefix}-${nextId++}`
}

const INITIAL_STATE: GameState = {
  money: 20000,
  population: 125000,
  buildings: [],
  missions: [],
  vehicles: [],
  gameTime: 0,
  isPaused: true,
  gameOver: false,
  selectedBuilding: null,
  selectedMission: null,
  placingBuilding: null,
  managingBuilding: null,
  missionsCompleted: 0,
  missionsFailed: 0,
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

// Movement speed in pixels per tick (1 tick = 1 second game time)
const VEHICLE_SPEED = 40

function moveVehicleAlongPath(v: Vehicle): Vehicle {
  if (v.path.length === 0 || v.pathIndex >= v.path.length) {
    return v
  }

  const target = v.path[v.pathIndex]
  const dx = target.x - v.position.x
  const dy = target.y - v.position.y
  const d = Math.sqrt(dx * dx + dy * dy)

  if (d < VEHICLE_SPEED) {
    // Reached this waypoint
    const newIndex = v.pathIndex + 1
    if (newIndex >= v.path.length) {
      // Reached destination
      return { ...v, position: { ...target }, pathIndex: newIndex }
    }
    return { ...v, position: { ...target }, pathIndex: newIndex }
  }

  // Move towards target
  const ratio = VEHICLE_SPEED / d
  return {
    ...v,
    position: {
      x: v.position.x + dx * ratio,
      y: v.position.y + dy * ratio,
    },
  }
}

export function useGameActions() {
  const placeBuilding = useCallback(
    (type: BuildingType, position: Position, size: "small" | "large" = "small") => {
      const config = BUILDING_CONFIGS[type]
      const cost = size === "small" ? config.smallCost : config.largeCost
      if (state.money < cost) return false

      const buildingId = genId("bldg")
      const nearestRoadNode = findNearestNode(position)

      const vehicles: Vehicle[] = config.vehicles.flatMap((v) => {
        const count = size === "small" ? Math.ceil(v.count / 2) : v.count
        return Array.from({ length: count }, () => ({
          id: genId("veh"),
          type: v.type,
          buildingId,
          status: "idle" as VehicleStatus,
          position: { ...position },
          path: [],
          pathIndex: 0,
          speed: VEHICLE_SPEED,
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
        nearestRoadNode,
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

    // Add extra vehicles on upgrade
    const newVehicles: Vehicle[] = config.vehicles.flatMap((v) => {
      return Array.from({ length: 1 }, () => ({
        id: genId("veh"),
        type: v.type,
        buildingId,
        status: "idle" as VehicleStatus,
        position: { ...building.position },
        path: [],
        pathIndex: 0,
        speed: VEHICLE_SPEED,
        workTimeRemaining: 0,
      }))
    })

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
      managingBuilding: state.managingBuilding?.id === buildingId
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
        b.id === buildingId ? { ...b, staff: b.staff + 1, efficiency: Math.min(1, b.efficiency + 0.05) } : b,
      ),
      managingBuilding: state.managingBuilding?.id === buildingId
        ? { ...state.managingBuilding, staff: state.managingBuilding.staff + 1, efficiency: Math.min(1, state.managingBuilding.efficiency + 0.05) }
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
      path: [],
      pathIndex: 0,
      speed: VEHICLE_SPEED,
      workTimeRemaining: 0,
    }

    state = {
      ...state,
      money: state.money - config.vehicleCost,
      buildings: state.buildings.map((b) =>
        b.id === buildingId ? { ...b, vehicles: [...b.vehicles, newVehicle] } : b,
      ),
      vehicles: [...state.vehicles, newVehicle],
      managingBuilding: state.managingBuilding?.id === buildingId
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

    // Compute paths for each vehicle
    const updatedVehicles = state.vehicles.map((v) => {
      const match = availableVehicles.find((av) => av.id === v.id)
      if (!match) return v

      const building = state.buildings.find((b) => b.id === v.buildingId)
      const fromNode = building?.nearestRoadNode || findNearestNode(v.position)
      const toNode = mission.nearestRoadNode
      const path = findPath(fromNode, toNode)

      return {
        ...v,
        status: "dispatched" as VehicleStatus,
        targetPosition: mission.position,
        missionId: mission.id,
        path,
        pathIndex: 0,
      }
    })

    const vehicleIds = availableVehicles.map((v) => v.id)

    state = {
      ...state,
      missions: state.missions.map((m) =>
        m.id === missionId
          ? { ...m, status: "dispatched" as const, dispatchedVehicles: vehicleIds }
          : m,
      ),
      vehicles: updatedVehicles,
    }
    emit()
  }, [])

  const generateMission = useCallback(() => {
    const types: MissionType[] = ["fire", "traffic-accident", "medical-emergency", "crime", "infrastructure"]
    const type = types[Math.floor(Math.random() * types.length)]
    const config = MISSION_CONFIGS[type]
    const titleIndex = Math.floor(Math.random() * config.titles.length)

    // Place missions within the city bounds (1600 x 1000)
    const position: Position = {
      x: 100 + Math.random() * 1400,
      y: 80 + Math.random() * 840,
    }
    const nearestRoadNode = findNearestNode(position)

    const mission: Mission = {
      id: genId("msn"),
      type,
      title: config.titles[titleIndex],
      description: config.descriptions[titleIndex],
      position,
      nearestRoadNode,
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

    let newMoney = state.money
    let completed = state.missionsCompleted
    let failed = state.missionsFailed

    // --- Move vehicles ---
    let updatedVehicles = state.vehicles.map((v) => {
      if (v.status === "dispatched") {
        const moved = moveVehicleAlongPath(v)
        // Check if arrived at destination
        if (moved.pathIndex >= moved.path.length && moved.path.length > 0) {
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
        const remaining = v.workTimeRemaining - 1
        if (remaining <= 0) {
          // Done working - start returning
          const building = state.buildings.find((b) => b.id === v.buildingId)
          if (building) {
            const fromNode = findNearestNode(v.position)
            const toNode = building.nearestRoadNode
            const returnPath = findPath(fromNode, toNode)
            return {
              ...v,
              status: "returning" as VehicleStatus,
              path: returnPath,
              pathIndex: 0,
              workTimeRemaining: 0,
            }
          }
          return { ...v, status: "idle" as VehicleStatus, workTimeRemaining: 0, path: [], pathIndex: 0 }
        }
        return { ...v, workTimeRemaining: remaining }
      }

      if (v.status === "returning") {
        const moved = moveVehicleAlongPath(v)
        if (moved.pathIndex >= moved.path.length && moved.path.length > 0) {
          const building = state.buildings.find((b) => b.id === v.buildingId)
          return {
            ...moved,
            status: "idle" as VehicleStatus,
            position: building ? { ...building.position } : moved.position,
            path: [],
            pathIndex: 0,
            missionId: undefined,
            targetPosition: undefined,
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

        const newTime = m.timeRemaining - 1

        // Check if all dispatched vehicles finished working
        if (m.status === "dispatched") {
          const dispVehicles = updatedVehicles.filter((v) => v.missionId === m.id)
          const allDone = dispVehicles.length > 0 && dispVehicles.every(
            (v) => v.status === "returning" || v.status === "idle",
          )
          if (allDone) {
            newMoney += m.reward
            completed++
            return { ...m, status: "completed" as const, timeRemaining: newTime }
          }
        }

        if (newTime <= 0) {
          newMoney -= m.penalty
          failed++
          // Return dispatched vehicles for failed missions
          const failedVehIds = new Set(m.dispatchedVehicles)
          updatedVehicles = updatedVehicles.map((v) => {
            if (failedVehIds.has(v.id) && v.status !== "idle") {
              const building = state.buildings.find((b) => b.id === v.buildingId)
              if (building && (v.status === "dispatched" || v.status === "working")) {
                const fromNode = findNearestNode(v.position)
                const returnPath = findPath(fromNode, building.nearestRoadNode)
                return {
                  ...v,
                  status: "returning" as VehicleStatus,
                  path: returnPath,
                  pathIndex: 0,
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
      gameTime: state.gameTime + 1,
      missionsCompleted: completed,
      missionsFailed: failed,
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
      // Refresh the building data from state
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
    resetGame: () => {
      nextId = 1
      state = { ...INITIAL_STATE, buildings: [], missions: [], vehicles: [] }
      emit()
    },
  }
}
