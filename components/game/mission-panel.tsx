"use client"

import {
  Flame,
  CarFront,
  HeartPulse,
  ShieldAlert,
  AlertTriangle,
  Send,
  Clock,
  DollarSign,
  X,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import type { Mission } from "@/lib/game-types"
import { MISSION_CONFIGS } from "@/lib/game-types"

const MISSION_ICONS: Record<string, typeof Flame> = {
  Flame,
  CarFront,
  HeartPulse,
  ShieldAlert,
  AlertTriangle,
}

interface MissionPanelProps {
  missions: Mission[]
  selectedMission: Mission | null
  onSelectMission: (mission: Mission | null) => void
  onDispatch: (missionId: string) => void
  buildingTypes: string[]
}

export function MissionPanel({
  missions,
  selectedMission,
  onSelectMission,
  onDispatch,
  buildingTypes,
}: MissionPanelProps) {
  const activeMissions = missions.filter(
    (m) => m.status === "pending" || m.status === "dispatched",
  )
  const recentResults = missions
    .filter((m) => m.status === "completed" || m.status === "failed")
    .slice(-5)
    .reverse()

  if (selectedMission) {
    const config = MISSION_CONFIGS[selectedMission.type]
    const Icon = MISSION_ICONS[config.icon]
    const urgencyRatio = selectedMission.timeRemaining / selectedMission.timeLimit
    const canDispatch = selectedMission.status === "pending"
    const hasRequiredBuildings = selectedMission.requiredBuildings.every((bt) =>
      buildingTypes.includes(bt),
    )

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Mission Details</h2>
          <button
            onClick={() => onSelectMission(null)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close mission details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${config.color}20` }}
            >
              {Icon && <Icon className="h-5 w-5" style={{ color: config.color }} />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {selectedMission.title}
              </h3>
              <p className="text-xs" style={{ color: config.color }}>
                {selectedMission.type.replace("-", " ")}
              </p>
            </div>
          </div>

          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            {selectedMission.description}
          </p>

          {/* Timer */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Time Remaining</span>
              </div>
              <span
                className={`font-mono text-xs font-semibold ${
                  urgencyRatio > 0.5
                    ? "text-primary"
                    : urgencyRatio > 0.25
                      ? "text-accent"
                      : "text-destructive"
                }`}
              >
                {selectedMission.timeRemaining}s
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${urgencyRatio * 100}%`,
                  backgroundColor:
                    urgencyRatio > 0.5
                      ? "hsl(142, 60%, 45%)"
                      : urgencyRatio > 0.25
                        ? "hsl(38, 90%, 55%)"
                        : "hsl(0, 72%, 55%)",
                }}
              />
            </div>
          </div>

          {/* Reward/Penalty */}
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2">
              <span className="text-xs text-primary">Reward</span>
              <span className="text-xs font-semibold text-primary">
                +${selectedMission.reward.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2">
              <span className="text-xs text-destructive">Penalty</span>
              <span className="text-xs font-semibold text-destructive">
                -${selectedMission.penalty.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Required buildings */}
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Required
            </h4>
            <div className="space-y-1">
              {selectedMission.requiredBuildings.map((bt) => {
                const hasIt = buildingTypes.includes(bt)
                return (
                  <div
                    key={bt}
                    className={`flex items-center gap-2 rounded-md px-3 py-1.5 ${
                      hasIt ? "bg-primary/10" : "bg-destructive/10"
                    }`}
                  >
                    {hasIt ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span
                      className={`text-xs ${hasIt ? "text-primary" : "text-destructive"}`}
                    >
                      {bt.replace(/-/g, " ")}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Dispatch */}
          {canDispatch && (
            <button
              onClick={() => onDispatch(selectedMission.id)}
              disabled={!hasRequiredBuildings}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              Dispatch Units
            </button>
          )}

          {selectedMission.status === "dispatched" && (
            <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-center text-xs font-medium text-accent">
              Units dispatched - en route
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Missions</h2>
        <p className="text-xs text-muted-foreground">{activeMissions.length} active</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeMissions.length === 0 && recentResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No active missions</p>
            <p className="text-xs text-muted-foreground">Press play to start</p>
          </div>
        )}

        {activeMissions.length > 0 && (
          <div className="mb-4 space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active
            </h3>
            {activeMissions.map((mission) => {
              const config = MISSION_CONFIGS[mission.type]
              const Icon = MISSION_ICONS[config.icon]
              const urgencyRatio = mission.timeRemaining / mission.timeLimit
              return (
                <button
                  key={mission.id}
                  onClick={() => onSelectMission(mission)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-left transition-all hover:border-primary/30 hover:bg-secondary/60"
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    {Icon && (
                      <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">
                      {mission.title}
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${urgencyRatio * 100}%`,
                          backgroundColor:
                            urgencyRatio > 0.5
                              ? "hsl(142, 60%, 45%)"
                              : urgencyRatio > 0.25
                                ? "hsl(38, 90%, 55%)"
                                : "hsl(0, 72%, 55%)",
                        }}
                      />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-primary">
                    +${mission.reward.toLocaleString()}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {recentResults.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent
            </h3>
            {recentResults.map((mission) => {
              const isCompleted = mission.status === "completed"
              return (
                <div
                  key={mission.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                    isCompleted
                      ? "border-primary/20 bg-primary/5"
                      : "border-destructive/20 bg-destructive/5"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {mission.title}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      isCompleted ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {isCompleted
                      ? `+$${mission.reward.toLocaleString()}`
                      : `-$${mission.penalty.toLocaleString()}`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
