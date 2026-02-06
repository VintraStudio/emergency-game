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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Building2, Zap } from "lucide-react"
import type { CityConfig } from "@/lib/game-types"

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

  // Mission generation -- every 8-15 seconds when not paused
  useEffect(() => {
    if (!started || state.isPaused || state.gameOver) {
      if (missionTimerRef.current) clearInterval(missionTimerRef.current)
      return
    }

    const spawnMission = () => {
      const activeMissions = state.missions.filter(
        (m) => m.status === "pending" || m.status === "dispatched",
      ).length
      if (activeMissions < 6) {
        actions.generateMission()
      }
    }

    if (state.missions.length === 0) {
      spawnMission()
    }

    const interval = 8000 + Math.random() * 7000
    missionTimerRef.current = setInterval(spawnMission, interval)

    return () => {
      if (missionTimerRef.current) clearInterval(missionTimerRef.current)
    }
  }, [started, state.isPaused, state.gameOver, state.missions, actions])

  const handleStart = useCallback(
    (city: CityConfig) => {
      actions.resetGame()
      actions.setCity(city)
      setStarted(true)
    },
    [actions],
  )

  const handleReset = useCallback(() => {
    actions.resetGame()
    setStarted(false)
  }, [actions])

  const buildingTypes = state.buildings.map((b) => b.type)

  if (!started || !state.city) {
    return <StartScreen onStart={handleStart} />
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {/* Top HUD */}
      <header className="shrink-0 border-b border-border bg-card/80 px-4 py-2 backdrop-blur-sm">
        <GameHud state={state} onTogglePause={actions.togglePause} />
      </header>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1">
        {/* Left Panel */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card/50 backdrop-blur-sm">
          <Tabs defaultValue="build" className="flex h-full flex-col">
            <TabsList className="mx-3 mt-3 grid w-auto grid-cols-2 bg-secondary/50">
              <TabsTrigger value="build" className="gap-1.5 text-xs">
                <Building2 className="h-3.5 w-3.5" />
                Build
              </TabsTrigger>
              <TabsTrigger value="missions" className="gap-1.5 text-xs">
                <Zap className="h-3.5 w-3.5" />
                Missions
              </TabsTrigger>
            </TabsList>
            <TabsContent value="build" className="m-0 min-h-0 flex-1">
              <BuildingPanel
                money={state.money}
                placingBuilding={state.placingBuilding}
                onSetPlacing={actions.setPlacing}
                selectedBuilding={state.selectedBuilding}
                onUpgrade={actions.upgradeBuilding}
                onSell={actions.sellBuilding}
                onDeselect={() => actions.selectBuilding(null)}
                onManage={actions.openBuildingManager}
              />
            </TabsContent>
            <TabsContent value="missions" className="m-0 min-h-0 flex-1">
              <MissionPanel
                missions={state.missions}
                selectedMission={state.selectedMission}
                onSelectMission={actions.selectMission}
                onDispatch={actions.dispatchVehicle}
                buildingTypes={buildingTypes}
              />
            </TabsContent>
          </Tabs>
        </aside>

        {/* Map */}
        <main className="min-h-0 flex-1 p-2">
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
