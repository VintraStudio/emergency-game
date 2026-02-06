"use client"

import {
  Flame, Shield, Heart, Siren, Stethoscope, Construction, Building2,
  ArrowUpCircle, Trash2, Truck, Users, X, Star, Gauge, UserPlus, Plus,
} from "lucide-react"
import type { Building } from "@/lib/game-types"
import { BUILDING_CONFIGS } from "@/lib/game-types"

const ICON_MAP: Record<string, typeof Flame> = {
  Flame, Shield, Heart, Siren, Stethoscope, Construction, Building2,
}

interface BuildingManagerProps {
  building: Building
  money: number
  onUpgrade: (buildingId: string) => void
  onHireStaff: (buildingId: string) => void
  onPurchaseVehicle: (buildingId: string) => void
  onSell: (buildingId: string) => void
  onClose: () => void
}

export function BuildingManager({
  building, money, onUpgrade, onHireStaff, onPurchaseVehicle, onSell, onClose,
}: BuildingManagerProps) {
  const config = BUILDING_CONFIGS[building.type]
  const Icon = ICON_MAP[config.icon]
  const canUpgrade = building.level < config.maxLevel && money >= config.upgradeCost * building.level
  const canHire = building.staff < building.maxStaff && money >= config.staffCost
  const canBuyVehicle = money >= config.vehicleCost
  const upgradeCost = config.upgradeCost * building.level

  const idleVehicles = building.vehicles.filter((v) => v.status === "idle").length
  const dispatchedVehicles = building.vehicles.filter((v) => v.status === "dispatched").length
  const workingVehicles = building.vehicles.filter((v) => v.status === "working").length
  const returningVehicles = building.vehicles.filter((v) => v.status === "returning").length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-slide-up w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${config.color}20` }}
            >
              {Icon && <Icon className="h-6 w-6" style={{ color: config.color }} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{building.name}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {building.size === "large" ? "Large" : "Small"} facility
                </span>
                <span className="text-xs" style={{ color: config.color }}>
                  Level {building.level}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close building manager"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 px-6 py-4">
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <Star className="mx-auto mb-1 h-4 w-4" style={{ color: config.color }} />
            <div className="text-lg font-bold text-foreground">{building.level}/{config.maxLevel}</div>
            <div className="text-xs text-muted-foreground">Level</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <Users className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
            <div className="text-lg font-bold text-foreground">{building.staff}/{building.maxStaff}</div>
            <div className="text-xs text-muted-foreground">Staff</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-center">
            <Gauge className="mx-auto mb-1 h-4 w-4 text-primary" />
            <div className="text-lg font-bold text-primary">{Math.round(building.efficiency * 100)}%</div>
            <div className="text-xs text-muted-foreground">Efficiency</div>
          </div>
        </div>

        {/* Vehicle Fleet */}
        <div className="border-t border-border px-6 py-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Vehicle Fleet ({building.vehicles.length})</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2">
              <span className="text-primary">Idle</span>
              <span className="font-bold text-primary">{idleVehicles}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-accent/10 px-3 py-2">
              <span className="text-accent">Dispatched</span>
              <span className="font-bold text-accent">{dispatchedVehicles}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-chart-4/10 px-3 py-2">
              <span style={{ color: "hsl(200, 70%, 50%)" }}>Working</span>
              <span className="font-bold" style={{ color: "hsl(200, 70%, 50%)" }}>{workingVehicles}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2">
              <span className="text-muted-foreground">Returning</span>
              <span className="font-bold text-foreground">{returningVehicles}</span>
            </div>
          </div>
          <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
            {building.vehicles.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md bg-secondary/20 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <Truck className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-foreground">{v.type}</span>
                </div>
                <span
                  className={`text-xs font-medium ${
                    v.status === "idle" ? "text-primary"
                    : v.status === "dispatched" ? "text-accent"
                    : v.status === "working" ? "text-chart-4"
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
        <div className="border-t border-border px-6 py-4">
          <div className="grid grid-cols-2 gap-2">
            {building.level < config.maxLevel && (
              <button
                onClick={() => onUpgrade(building.id)}
                disabled={!canUpgrade}
                className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUpCircle className="h-4 w-4" />
                <span>Upgrade (${upgradeCost.toLocaleString()})</span>
              </button>
            )}
            <button
              onClick={() => onHireStaff(building.id)}
              disabled={!canHire}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <UserPlus className="h-4 w-4" />
              <span>Hire (${config.staffCost.toLocaleString()})</span>
            </button>
            <button
              onClick={() => onPurchaseVehicle(building.id)}
              disabled={!canBuyVehicle}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              <span>Vehicle (${config.vehicleCost.toLocaleString()})</span>
            </button>
            <button
              onClick={() => { onSell(building.id); onClose() }}
              className="flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <Trash2 className="h-4 w-4" />
              <span>Sell (${Math.floor(building.cost * 0.5).toLocaleString()})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
