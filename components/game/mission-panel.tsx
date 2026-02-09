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
import { formatMissionTime } from "@/lib/time-utils"
import "./mission-panel.css"

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
      <div className="mission-panel">
        <div className="mission-panel-header">
          <h2 className="mission-panel-title">Mission Details</h2>
          <button
            onClick={() => onSelectMission(null)}
            className="mission-panel-close-btn"
            aria-label="Close mission details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mission-panel-content">
          <div className="mission-panel-header-info">
            <div
              className="mission-panel-icon"
              style={{ backgroundColor: `${config.color}20` }}
            >
              {Icon && <Icon className="h-5 w-5" style={{ color: config.color }} />}
            </div>
            <div>
              <h3 className="mission-panel-title-text">
                {selectedMission.title}
              </h3>
              <p className="mission-panel-type" style={{ color: config.color }}>
                {selectedMission.type.replace("-", " ")}
              </p>
            </div>
          </div>

          <p className="mission-panel-description">
            {selectedMission.description}
          </p>

          {/* Timer */}
          <div className="mission-timer">
            <div className="mission-timer-header">
              <div className="mission-timer-label">
                <Clock className="h-3.5 w-3.5" />
                <span>Time Remaining</span>
              </div>
              <span
                className={`mission-timer-time ${
                  urgencyRatio > 0.5
                    ? "mission-timer-good"
                    : urgencyRatio > 0.25
                      ? "mission-timer-medium"
                      : "mission-timer-critical"
                }`}
              >
                {formatMissionTime(selectedMission.timeRemaining)}
              </span>
            </div>
            <div className="mission-timer-bar">
              <div
                className="mission-timer-progress"
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
          <div className="mission-rewards">
            <div className="mission-reward">
              <span>Reward</span>
              <span>+${selectedMission.reward.toLocaleString()}</span>
            </div>
            <div className="mission-penalty">
              <span>Penalty</span>
              <span>-${selectedMission.penalty.toLocaleString()}</span>
            </div>
          </div>

          {/* Required buildings */}
          <div className="mission-required">
            <h4 className="mission-required-title">Required</h4>
            <div className="mission-required-list">
              {selectedMission.requiredBuildings.map((bt) => {
                const hasIt = buildingTypes.includes(bt)
                return (
                  <div
                    key={bt}
                    className={`mission-required-item ${
                      hasIt ? "mission-required-has" : "mission-required-missing"
                    }`}
                  >
                    {hasIt ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    <span className={hasIt ? "" : ""}>
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
              className="mission-dispatch-btn"
            >
              <Send className="h-4 w-4" />
              Dispatch Units
            </button>
          )}

          {selectedMission.status === "dispatched" && (
            <div className="mission-dispatched">
              Units dispatched - en route
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mission-panel">
      <div className="mission-panel-header">
        <h2 className="mission-panel-title">Missions</h2>
        <p className="mission-panel-subtitle">{activeMissions.length} active</p>
      </div>

      <div className="mission-panel-content">
        {activeMissions.length === 0 && recentResults.length === 0 && (
          <div className="mission-panel-empty">
            <AlertTriangle className="mission-panel-empty-icon" />
            <p>No active missions</p>
            <p>Press play to start</p>
          </div>
        )}

        {activeMissions.length > 0 && (
          <div className="mission-list-section">
            <h3 className="mission-list-title">Active</h3>
            {activeMissions.map((mission) => {
              const config = MISSION_CONFIGS[mission.type]
              const Icon = MISSION_ICONS[config.icon]
              const urgencyRatio = mission.timeRemaining / mission.timeLimit
              return (
                <button
                  key={mission.id}
                  onClick={() => onSelectMission(mission)}
                  className="mission-item"
                >
                  <div
                    className="mission-item-icon"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    {Icon && (
                      <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                    )}
                  </div>
                  <div className="mission-item-content">
                    <div className="mission-item-title">
                      {mission.title}
                    </div>
                    <div className="mission-item-progress">
                      <div
                        className="mission-item-progress-bar"
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
                  <span className="mission-item-reward">
                    +${mission.reward.toLocaleString()}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {recentResults.length > 0 && (
          <div className="mission-list-section">
            <h3 className="mission-list-title">Recent</h3>
            {recentResults.map((mission) => {
              const isCompleted = mission.status === "completed"
              return (
                <div
                  key={mission.id}
                  className={`mission-result-item ${
                    isCompleted ? "mission-result-completed" : "mission-result-failed"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span className="mission-result-title">
                    {mission.title}
                  </span>
                  <span
                    className={`mission-result-amount ${
                      isCompleted ? "mission-result-positive" : "mission-result-negative"
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
