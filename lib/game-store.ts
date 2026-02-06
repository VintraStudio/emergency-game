'use client';

import { useSyncExternalStore, useCallback } from "react"
import type {
  GameState,
  Building,
  Mission,
  Vehicle,
  BuildingType,
  MissionType,
  Position,
} from "./game-types"
import { BUILDING_CONFIGS, MISSION_CONFIGS } from "./game-types"

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

export function useGameActions() {
  const dispatch = useCallback((updater: (s: GameState) => GameState) => {
    state = updater(state)
    emit()
  }, [])

  const placeBuilding = useCallback(
    (type: BuildingType, position: Position, size: "small" | "large" = "small") => {
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
          status: "idle" as const,
          position: { ...position },
          speed: 2,
        }))
      })

      const building: Building = {
        id: buildingId,
        type,
        size,
        name: `${config.name} ${state.buildings.filter((b) => b.type === type).length + 1}`,
        position,
        vehicles,
        staff: size === "small" ? 5 : 12,
        maxStaff: size === "small" ? 8 : 20,
        upgrades: [],
        cost,
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
    if (!building || building.size === "large") return false

    const config = BUILDING_CONFIGS[building.type]
    if (state.money < config.upgradeCost) return false

    const newVehicles: Vehicle[] = config.vehicles.flatMap((v) => {
      const additionalCount = Math.ceil(v.count / 2)
      return Array.from({ length: additionalCount }, () => ({
        id: genId("veh"),
        type: v.type,
        buildingId,
        status: "idle" as const,
        position: { ...building.position },
        speed: 2,
      }))
    })

    state = {
      ...state,
      money: state.money - config.upgradeCost,
      buildings: state.buildings.map((b) =>
        b.id === buildingId
          ? {
              ...b,
              size: "large" as const,
              maxStaff: 20,
              staff: b.staff + 5,
              vehicles: [...b.vehicles, ...newVehicles],
            }
          : b,
      ),
      vehicles: [...state.vehicles, ...newVehicles],
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

    state = {
      ...state,
      missions: state.missions.map((m) =>
        m.id === missionId
          ? { ...m, status: "dispatched" as const, dispatchedVehicles: vehicleIds }
          : m,
      ),
      vehicles: state.vehicles.map((v) =>
        vehicleIds.includes(v.id)
          ? { ...v, status: "dispatched" as const, targetPosition: mission.position }
          : v,
      ),
    }
    emit()
  }, [])

  const generateMission = useCallback(() => {
    const types: MissionType[] = ["fire", "traffic-accident", "medical-emergency", "crime", "infrastructure"]
    const type = types[Math.floor(Math.random() * types.length)]
    const config = MISSION_CONFIGS[type]
    const titleIndex = Math.floor(Math.random() * config.titles.length)

    const mission: Mission = {
      id: genId("msn"),
      type,
      title: config.titles[titleIndex],
      description: config.descriptions[titleIndex],
      position: {
        x: 80 + Math.random() * 640,
        y: 80 + Math.random() * 440,
      },
      status: "pending",
      reward: config.baseReward + Math.floor(Math.random() * 500),
      penalty: config.basePenalty + Math.floor(Math.random() * 200),
      timeLimit: config.baseTimeLimit,
      timeRemaining: config.baseTimeLimit,
      requiredBuildings: config.requiredBuildings,
      dispatchedVehicles: [],
      createdAt: state.gameTime,
    }

    state = {
      ...state,
      missions: [...state.missions, mission],
    }
    emit()
  }, [])

  const tick = useCallback(() => {
    if (state.isPaused || state.gameOver) return

    let newMoney = state.money
    let completed = state.missionsCompleted
    let failed = state.missionsFailed

    // Update missions
    const updatedMissions = state.missions
      .map((m) => {
        if (m.status === "completed" || m.status === "failed") return m

        const newTime = m.timeRemaining - 1

        if (m.status === "dispatched" && newTime <= m.timeLimit * 0.5) {
          newMoney += m.reward
          completed++
          return { ...m, status: "completed" as const, timeRemaining: newTime }
        }

        if (newTime <= 0) {
          newMoney -= m.penalty
          failed++
          return { ...m, status: "failed" as const, timeRemaining: 0 }
        }

        return { ...m, timeRemaining: newTime }
      })
      .filter((m) => {
        if (m.status === "completed" || m.status === "failed") {
          const age = state.gameTime - m.createdAt
          return age < m.timeLimit + 15
        }
        return true
      })

    // Return dispatched vehicles after mission completes
    const completedVehicleIds = new Set(
      updatedMissions
        .filter((m) => m.status === "completed" || m.status === "failed")
        .flatMap((m) => m.dispatchedVehicles),
    )

    const updatedVehicles = state.vehicles.map((v) => {
      if (completedVehicleIds.has(v.id) && v.status === "dispatched") {
        const building = state.buildings.find((b) => b.id === v.buildingId)
        return {
          ...v,
          status: "idle" as const,
          position: building ? { ...building.position } : v.position,
          targetPosition: undefined,
        }
      }
      return v
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
    dispatch,
    placeBuilding,
    upgradeBuilding,
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
