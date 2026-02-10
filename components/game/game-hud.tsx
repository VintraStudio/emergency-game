"use client"

import {
  DollarSign,
  Users,
  Clock,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Building2,
  Zap,
  Truck,
  Gauge,
} from "lucide-react"
import type { GameState } from "@/lib/game-types"
import { formatGameTime, formatGameDate, getSpeedMultiplier } from "@/lib/time-utils"
import "./game-hud.css"

interface GameHudProps {
  state: GameState
  onTogglePause: () => void
  onSetGameSpeed?: (speed: 1 | 2 | 3) => void
}

export function GameHud({ state, onTogglePause, onSetGameSpeed }: GameHudProps) {
  const activeMissions = state.missions.filter(
    (m) => m.status === "pending" || m.status === "dispatched",
  ).length

  const handleSpeedChange = (speed: 1 | 2 | 3) => {
    if (onSetGameSpeed) {
      onSetGameSpeed(speed)
    }
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="game-hud">
      <div className="hud-section">
        {/* Play/Pause */}
        <div className="hud-controls">
          <button
            onClick={onTogglePause}
            className={`hud-button ${state.isPaused ? "primary" : ""}`}
            aria-label={state.isPaused ? "Resume" : "Pause"}
          >
            {state.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
        </div>

        {/* Time */}
        <div className="hud-time">
          <Clock className="clock" />
          <div className="time-display">
            <span className="time">{formatGameTime(state.gameTime)}</span>
            <span className="date">{formatGameDate(state.gameTime)}</span>
          </div>
        </div>

        {/* Speed Control */}
        <div className="hud-speed">
          <Gauge className="h-3.5 w-3.5" />
          <div className="speed-buttons">
            <button 
              className={`speed-button ${state.gameSpeed === 1 ? "active" : ""}`}
              onClick={() => handleSpeedChange(1)}
              title="Normal speed (1 min = 1 sec)"
            >
              {'>'}
            </button>
            <button 
              className={`speed-button ${state.gameSpeed === 2 ? "active" : ""}`}
              onClick={() => handleSpeedChange(2)}
              title="Fast speed (1 min = 0.5 sec)"
            >
              {'>>'}
            </button>
            <button 
              className={`speed-button ${state.gameSpeed === 3 ? "active" : ""}`}
              onClick={() => handleSpeedChange(3)}
              title="Very fast speed (1 min = 0.33 sec)"
            >
              {'>>>'}
            </button>
          </div>
        </div>
      </div>

      <div className="hud-resources">
        {/* Money */}
        <div className={`hud-resource ${state.money < 2000 ? "danger" : ""}`}>
          <DollarSign className="money" />
          <span className="hud-resource-count">{formatMoney(state.money)}</span>
        </div>

        {/* Population */}
        <div className="hud-resource">
          <Users className="h-3.5 w-3.5" />
          <span className="hud-resource-count">{state.population.toLocaleString()}</span>
        </div>

        {/* Buildings */}
        <div className="hud-resource">
          <Building2 className="h-3.5 w-3.5" />
          <span className="hud-resource-count">{state.buildings.length}</span>
        </div>

        {/* Active Vehicles */}
        <div className="hud-resource">
          <Truck className="h-3.5 w-3.5" />
          <span className="hud-resource-count">
            {state.vehicles.filter((v) => v.status !== "idle").length}/{state.vehicles.length}
          </span>
        </div>

        {/* Active Missions */}
        <div className={`hud-resource ${state.unreadMissionCount > 0 ? "primary" : ""}`}>
          <div className="relative">
            <Zap className="lighting" />
            {state.unreadMissionCount > 0 && (
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold animate-pulse">
                {state.unreadMissionCount}
              </div>
            )}
          </div>
          <span className="hud-resource-count">{activeMissions}</span>
        </div>
      </div>

      <div className="hud-section">
        {/* Stats */}
        <div className="hud-resources">
          <div className="hud-resource">
            <CheckCircle2 className="check" />
            <span className="hud-resource-count">{state.missionsCompleted}</span>
          </div>
          <div className="hud-resource danger">
            <XCircle className="fail" />
            <span className="hud-resource-count">{state.missionsFailed}</span>
          </div>
        </div>

        {/* Alerts */}
        {state.money < 3000 && state.money >= 0 && (
          <div className="hud-resource primary">
            <AlertCircle className="h-3.5 w-3.5" />
            <span className="hud-resource-count">Low Funds</span>
          </div>
        )}
      </div>
    </div>
  )
}
