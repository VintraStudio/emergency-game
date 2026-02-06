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
} from "lucide-react"
import type { GameState } from "@/lib/game-types"

interface GameHudProps {
  state: GameState
  onTogglePause: () => void
}

export function GameHud({ state, onTogglePause }: GameHudProps) {
  const activeMissions = state.missions.filter(
    (m) => m.status === "pending" || m.status === "dispatched",
  ).length

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="flex items-center gap-3">
      {/* Play/Pause */}
      <button
        onClick={onTogglePause}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
          state.isPaused
            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
            : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
        }`}
        aria-label={state.isPaused ? "Resume" : "Pause"}
      >
        {state.isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </button>

      {/* Time */}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/80 px-3 py-1.5 backdrop-blur-sm">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-sm text-foreground">{formatTime(state.gameTime)}</span>
      </div>

      {/* Money */}
      <div
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 backdrop-blur-sm ${
          state.money < 2000
            ? "border-destructive/40 bg-destructive/10"
            : "border-primary/30 bg-card/80"
        }`}
      >
        <DollarSign
          className={`h-3.5 w-3.5 ${state.money < 2000 ? "text-destructive" : "text-primary"}`}
        />
        <span
          className={`font-mono text-sm font-semibold ${
            state.money < 2000 ? "text-destructive" : "text-primary"
          }`}
        >
          {formatMoney(state.money)}
        </span>
      </div>

      {/* Population */}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/80 px-3 py-1.5 backdrop-blur-sm">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-foreground">
          {state.population.toLocaleString()}
        </span>
      </div>

      {/* Buildings */}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/80 px-3 py-1.5 backdrop-blur-sm">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-foreground">{state.buildings.length}</span>
      </div>

      {/* Active Vehicles */}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/80 px-3 py-1.5 backdrop-blur-sm">
        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-foreground">
          {state.vehicles.filter((v) => v.status !== "idle").length}/{state.vehicles.length}
        </span>
      </div>

      {/* Active Missions */}
      <div
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 backdrop-blur-sm ${
          activeMissions > 0
            ? "border-accent/40 bg-accent/10"
            : "border-border bg-card/80"
        }`}
      >
        <Zap
          className={`h-3.5 w-3.5 ${activeMissions > 0 ? "text-accent" : "text-muted-foreground"}`}
        />
        <span
          className={`text-sm font-medium ${
            activeMissions > 0 ? "text-accent" : "text-foreground"
          }`}
        >
          {activeMissions}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-sm">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-primary">{state.missionsCompleted}</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <XCircle className="h-3.5 w-3.5 text-destructive" />
          <span className="text-destructive">{state.missionsFailed}</span>
        </div>
      </div>

      {/* Alerts */}
      {state.money < 3000 && state.money >= 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-medium text-accent">Low Funds</span>
        </div>
      )}
    </div>
  )
}
