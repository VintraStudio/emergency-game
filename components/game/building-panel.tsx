"use client"

import {
  Flame,
  Shield,
  Heart,
  Siren,
  Stethoscope,
  Construction,
  Building2,
  ArrowUpCircle,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react"
import type { Building, BuildingType } from "@/lib/game-types"
import { BUILDING_CONFIGS } from "@/lib/game-types"

const ICON_MAP: Record<string, typeof Flame> = {
  Flame,
  Shield,
  Heart,
  Siren,
  Stethoscope,
  Construction,
  Building2,
}

interface BuildingPanelProps {
  money: number
  placingBuilding: BuildingType | null
  onSetPlacing: (type: BuildingType | null) => void
  selectedBuilding: Building | null
  onUpgrade: (buildingId: string) => void
  onSell: (buildingId: string) => void
  onDeselect: () => void
}

export function BuildingPanel({
  money,
  placingBuilding,
  onSetPlacing,
  selectedBuilding,
  onUpgrade,
  onSell,
  onDeselect,
}: BuildingPanelProps) {
  const buildingTypes = Object.entries(BUILDING_CONFIGS) as [
    BuildingType,
    (typeof BUILDING_CONFIGS)[BuildingType],
  ][]

  if (selectedBuilding) {
    const config = BUILDING_CONFIGS[selectedBuilding.type]
    const Icon = ICON_MAP[config.icon]
    const canUpgrade = selectedBuilding.size === "small" && money >= config.upgradeCost

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Building Details</h2>
          <button
            onClick={onDeselect}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close panel"
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
              <h3 className="text-sm font-semibold text-foreground">{selectedBuilding.name}</h3>
              <p className="text-xs text-muted-foreground">
                {selectedBuilding.size === "large" ? "Large" : "Small"} facility
              </p>
            </div>
          </div>

          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Staff</span>
              </div>
              <span className="text-xs font-medium text-foreground">
                {selectedBuilding.staff}/{selectedBuilding.maxStaff}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Vehicles</span>
              </div>
              <span className="text-xs font-medium text-foreground">
                {selectedBuilding.vehicles.length}
              </span>
            </div>
          </div>

          {/* Vehicle list */}
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Vehicles
            </h4>
            <div className="space-y-1">
              {selectedBuilding.vehicles.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-1.5"
                >
                  <span className="text-xs text-foreground">{v.type}</span>
                  <span
                    className={`text-xs font-medium ${
                      v.status === "idle"
                        ? "text-primary"
                        : v.status === "dispatched"
                          ? "text-accent"
                          : "text-muted-foreground"
                    }`}
                  >
                    {v.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {selectedBuilding.size === "small" && (
              <button
                onClick={() => onUpgrade(selectedBuilding.id)}
                disabled={!canUpgrade}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUpCircle className="h-4 w-4" />
                Upgrade (${config.upgradeCost.toLocaleString()})
              </button>
            )}
            <button
              onClick={() => onSell(selectedBuilding.id)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <Trash2 className="h-4 w-4" />
              Sell (${Math.floor(selectedBuilding.cost * 0.5).toLocaleString()})
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Build</h2>
        <p className="text-xs text-muted-foreground">Place emergency buildings</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {buildingTypes.map(([type, config]) => {
            const Icon = ICON_MAP[config.icon]
            const isActive = placingBuilding === type
            const canAfford = money >= config.smallCost
            return (
              <button
                key={type}
                onClick={() => onSetPlacing(isActive ? null : type)}
                disabled={!canAfford && !isActive}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                  isActive
                    ? "border-primary/50 bg-primary/10"
                    : canAfford
                      ? "border-border bg-secondary/30 hover:border-primary/30 hover:bg-secondary/60"
                      : "cursor-not-allowed border-border/50 bg-secondary/10 opacity-50"
                }`}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${config.color}20` }}
                >
                  {Icon && <Icon className="h-4 w-4" style={{ color: config.color }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground">{config.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ${config.smallCost.toLocaleString()}
                  </div>
                </div>
                {isActive && (
                  <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
