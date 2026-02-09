"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useGameState, useGameActions } from "@/lib/game-store"
import { CityMap } from "./city-map"
import { GameHud } from "./game-hud"
import { BuildingPanel } from "./building-panel"
import { MissionPanel } from "./mission-panel"
import { BuildingManager } from "./building-manager"
import { GameOver } from "./game-over"
import { StartScreen } from "./start-screen"
import { Building2, Zap } from "lucide-react"
import type { CityConfig } from "@/lib/game-types"
import "./game-client.css"

export function GameClient() {
  const state = useGameState()
  const actions = useGameActions()
  const [started, setStarted] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const missionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Game loop -- tick every 500ms for vehicle movement
  useEffect(() => {
    if (!started) return

    tickRef.current = setInterval(() => {
      actions.tick()
    }, 500)

    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [started, actions])

  // Time update -- every 100ms for smooth time display
  useEffect(() => {
    if (!started) return

    const timeUpdateInterval = setInterval(() => {
      actions.updateTime() // Update time display
    }, 100)

    return () => {
      if (timeUpdateInterval) clearInterval(timeUpdateInterval)
    }
  }, [started, actions])

  // Mission generation -- every 8-15 seconds when not paused
  useEffect(() => {
    if (!started || state.isPaused || state.gameOver) {
      if (missionTimerRef.current) clearInterval(missionTimerRef.current)
      return
    }

    const spawnMission = () => {
      actions.generateMission() // generateMission handles the limit check
    }

    const delay = Math.random() * 7000 + 8000 // 8-15 seconds
    missionTimerRef.current = setInterval(spawnMission, delay)

    return () => {
      if (missionTimerRef.current) clearInterval(missionTimerRef.current)
    }
  }, [started, state.isPaused, state.gameOver, actions])

  const handleStart = useCallback((city: CityConfig) => {
    actions.setCity(city)
    actions.startGame()
    setStarted(true)
  }, [actions])

  const handleReset = useCallback(() => {
    actions.resetGame()
    setStarted(false)
  }, [actions])

  const buildingTypes = state.buildings.map((b) => b.type)

  if (!started || !state.city) {
    return <StartScreen onStart={handleStart} />
  }

  return (
    <div className="game-client">
      {/* Top HUD */}
      <header className="game-header">
        <GameHud state={state} onTogglePause={actions.togglePause} onSetGameSpeed={actions.setGameSpeed} />
      </header>

      {/* Main Content */}
      <div className="game-main-content">
        {/* Left Panel */}
        <aside className="game-sidebar">
          <div className="game-tabs">
            <div className="game-tabs-list">
              <button 
                className={`game-tab ${!state.selectedMission ? "active" : ""}`}
                onClick={() => {
                  actions.selectMission(null)
                  actions.setPlacing(null)
                }}
              >
                <Building2 className="w-4 h-4" />
                Build
              </button>
              <button 
                className={`game-tab ${state.selectedMission ? "active" : ""}`}
                onClick={() => {
                  // Just select a dummy mission to show missions panel
                  const dummyMission = {
                    id: 'missions-view',
                    type: 'fire' as const,
                    title: 'Missions',
                    description: 'View all active missions',
                    status: 'pending' as const,
                    timeRemaining: 0,
                    timeLimit: 0,
                    reward: 0,
                    penalty: 0,
                    requiredBuildings: [],
                    position: { lat: 0, lng: 0 },
                    vehicles: [],
                    dispatchedVehicles: [],
                    workDuration: 0,
                    createdAt: Date.now()
                  }
                  actions.selectMission(dummyMission)
                  
                  // Also try to generate a mission for testing
                  setTimeout(() => {
                    actions.generateMission()
                  }, 1000)
                }}
              >
                <Zap className="w-4 h-4" />
                Missions
              </button>
            </div>
            <div className="game-tabs-content">
              {!state.selectedMission && (
                <BuildingPanel
                  state={state}
                  placingBuilding={state.placingBuilding}
                  selectedBuilding={state.selectedBuilding}
                  onSetPlacing={actions.setPlacing}
                  onUpgrade={actions.upgradeBuilding}
                  onSell={actions.sellBuilding}
                  onDeselect={() => actions.selectBuilding(null)}
                  onManage={() => actions.openBuildingManager(null)}
                />
              )}
              {state.selectedMission && (
                <MissionPanel
                  missions={state.missions}
                  selectedMission={state.selectedMission.id === 'missions-view' ? null : state.selectedMission}
                  onSelectMission={actions.selectMission}
                  onDispatch={actions.dispatchVehicle}
                  buildingTypes={buildingTypes}
                />
              )}
            </div>
          </div>
        </aside>

        {/* Map */}
        <main className="game-map-container">
          <CityMap
            city={state.city}
            buildings={state.buildings}
            missions={state.missions}
            vehicles={state.vehicles}
            placingBuilding={state.placingBuilding}
            onPlaceBuilding={(type, pos) => actions.placeBuilding(type, pos)}
            onSelectBuilding={actions.selectBuilding}
            onSelectMission={actions.selectMission}
            onOpenBuilding={actions.openBuildingManager}
          />
        </main>
      </div>

      {/* Building Management Modal */}
      {state.managingBuilding && (
        <BuildingManager
          building={state.managingBuilding}
          money={state.money}
          onUpgrade={actions.upgradeBuilding}
          onHireStaff={actions.hireStaff}
          onPurchaseVehicle={actions.purchaseVehicle}
          onSell={actions.sellBuilding}
          onClose={() => actions.openBuildingManager(null)}
        />
      )}

      {/* Game Over Overlay */}
      {state.gameOver && <GameOver state={state} onReset={handleReset} />}
    </div>
  )
}
