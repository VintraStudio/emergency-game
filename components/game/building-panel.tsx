"use client"

import {
  Flame,
  CarFront,
  HeartPulse,
  ShieldAlert,
  AlertTriangle,
  DollarSign,
  Zap,
  Truck,
  Users,
  Building2,
  Wrench,
  X,
} from "lucide-react"
import type { Building, BuildingType, GameState } from "@/lib/game-types"
import { BUILDING_CONFIGS } from "@/lib/game-types"
import "./building-panel.css"

const ICON_MAP: Record<string, typeof Flame> = {
  flame: Flame,
  "traffic-accident": CarFront,
  "medical-emergency": HeartPulse,
  crime: ShieldAlert,
  infrastructure: AlertTriangle,
}

interface BuildingPanelProps {
  state: GameState
  placingBuilding: BuildingType | null
  selectedBuilding: Building | null
  onSetPlacing: (type: BuildingType | null) => void
  onUpgrade: (id: string) => void
  onSell: (id: string) => void
  onDeselect: () => void
  onManage: () => void
}

export function BuildingPanel({
  state,
  placingBuilding,
  selectedBuilding,
  onSetPlacing,
  onUpgrade,
  onSell,
  onDeselect,
  onManage,
}: BuildingPanelProps) {
  const buildingTypes = Object.entries(BUILDING_CONFIGS) as [BuildingType, typeof BUILDING_CONFIGS['fire-station']][]

  return (
    <div className="building-panel">
      <div className="building-panel-header">
        <h2 className="building-panel-title">Build</h2>
      </div>

      <div className="building-panel-list">
        <div className="building-list-container">
          {buildingTypes.map(([type, config]) => {
            const Icon = ICON_MAP[config.icon]
            const isActive = state.placingBuilding === type
            const canAfford = state.money >= config.smallCost

            return (
              <button
                key={type}
                onClick={() => onSetPlacing(isActive ? null : type)}
                disabled={!canAfford && !isActive}
                className={`building-button ${isActive ? "primary" : ""}`}
              >
                <div
                  className="building-icon-container"
                  style={{ backgroundColor: `${config.color}20` }}
                >
                  {Icon && <Icon className="building-button-icon" style={{ color: config.color }} />}
                </div>
                <div className="building-info">
                  <div className="building-item-name">{config.name}</div>
                  <div className="building-cost">
                    <div className="building-cost-icon">
                      <DollarSign className="building-button-icon" style={{ color: config.color }} />
                    </div>
                    <span className="building-cost-amount">{config.smallCost.toLocaleString()}</span>
                  </div>
                </div>
                {isActive && <div className="building-active-indicator" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
