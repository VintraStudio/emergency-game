"use client"

import {
  Flame, Shield, Heart, Siren, Stethoscope, Construction, Building2,
  ArrowUpCircle, Trash2, Truck, Users, X, Star, Gauge, UserPlus, Plus,
} from "lucide-react"
import type { Building } from "@/lib/game-types"
import { BUILDING_CONFIGS } from "@/lib/game-types"
import "./building-manager.css"

const ICON_MAP: Record<string, typeof Flame> = {
  Flame, Shield, Heart, Siren, Stethoscope, Construction, Building2,
}

interface BuildingManagerProps {
  building: Building | null
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
  console.log("🏗️ BUILDING MANAGER RENDER - Building:", building?.name || "null", "Money:", money)
  
  if (!building) {
    console.log("🏗️ BUILDING MANAGER - No building, returning null")
    return null
  }

  const config = BUILDING_CONFIGS[building.type]
  const Icon = ICON_MAP[config.icon]
  const canUpgrade = building.level < config.maxLevel && money >= config.upgradeCost * building.level
  const canHire = building.staff < building.maxStaff && money >= config.staffCost
  const canBuyVehicle = money >= config.vehicleCost
  const upgradeCost = config.upgradeCost * building.level

  const idleVehicles = building.vehicles.filter((v) => v.status === "idle").length
  const preparingVehicles = building.vehicles.filter((v) => v.status === "preparing").length
  const dispatchedVehicles = building.vehicles.filter((v) => v.status === "dispatched").length
  const workingVehicles = building.vehicles.filter((v) => v.status === "working").length
  const returningVehicles = building.vehicles.filter((v) => v.status === "returning").length

  return (
    <div className="building-manager-overlay" onClick={onClose}>
      <div
        className="building-manager-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="building-manager-header">
          <div className="building-manager-title">
            <div
              className="building-manager-icon"
              style={{ backgroundColor: `${config.color}20` }}
            >
              {Icon && <Icon className="h-6 w-6" style={{ color: config.color }} />}
            </div>
            <div className="building-manager-info">
              <h2>{building.name}</h2>
              <div className="building-manager-meta">
                <span className="building-manager-size">
                  {building.size === "large" ? "Large" : "Small"} facility
                </span>
                <span className="building-manager-level" style={{ color: config.color }}>
                  Level {building.level}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="building-manager-close"
            aria-label="Close building manager"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="building-manager-stats">
          <div className="building-manager-stat">
            <Star className="building-manager-stat-icon" style={{ color: config.color }} />
            <div className="building-manager-stat-value">{building.level}/{config.maxLevel}</div>
            <div className="building-manager-stat-label">Level</div>
          </div>
          <div className="building-manager-stat">
            <Users className="building-manager-stat-icon text-muted-foreground" />
            <div className="building-manager-stat-value">{building.staff}/{building.maxStaff}</div>
            <div className="building-manager-stat-label">Staff</div>
          </div>
          <div className="building-manager-stat">
            <Gauge className="building-manager-stat-icon text-primary" />
            <div className="building-manager-stat-value text-primary">{Math.round(building.efficiency * 100)}%</div>
            <div className="building-manager-stat-label">Efficiency</div>
          </div>
        </div>

        {/* Vehicle Fleet */}
        <div className="building-manager-section">
          <h3 className="building-manager-section-title">Vehicle Fleet ({building.vehicles.length})</h3>
          <div className="building-manager-vehicle-grid">
            <div className="building-manager-vehicle-status idle">
              <span className="text-primary">Idle</span>
              <span className="font-bold text-primary">{idleVehicles}</span>
            </div>
            <div className="building-manager-vehicle-status preparing">
              <span style={{ color: "hsl(45, 70%, 50%)" }}>Preparing</span>
              <span className="font-bold" style={{ color: "hsl(45, 70%, 50%)" }}>{preparingVehicles}</span>
            </div>
            <div className="building-manager-vehicle-status dispatched">
              <span className="text-accent">Dispatched</span>
              <span className="font-bold text-accent">{dispatchedVehicles}</span>
            </div>
            <div className="building-manager-vehicle-status working">
              <span style={{ color: "hsl(200, 70%, 50%)" }}>Working</span>
              <span className="font-bold" style={{ color: "hsl(200, 70%, 50%)" }}>{workingVehicles}</span>
            </div>
            <div className="building-manager-vehicle-status returning">
              <span className="text-muted-foreground">Returning</span>
              <span className="font-bold text-foreground">{returningVehicles}</span>
            </div>
          </div>
          <div className="building-manager-vehicle-list">
            {building.vehicles.map((v) => (
              <div key={v.id} className="building-manager-vehicle-item">
                <div className="building-manager-vehicle-info">
                  <Truck className="building-manager-vehicle-icon" />
                  <span className="building-manager-vehicle-name">{v.type}</span>
                </div>
                <span
                  className={`building-manager-vehicle-status-badge ${
                    v.status === "idle" ? "idle"
                    : v.status === "preparing" ? "preparing"
                    : v.status === "dispatched" ? "dispatched"
                    : v.status === "working" ? "working"
                    : "returning"
                  }`}
                >
                  {v.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="building-manager-section">
          <div className="building-manager-actions">
            {building.level < config.maxLevel && (
              <button
                onClick={() => onUpgrade(building.id)}
                disabled={!canUpgrade}
                className="building-manager-button upgrade"
              >
                <ArrowUpCircle className="h-4 w-4" />
                <span>Upgrade (${upgradeCost.toLocaleString()})</span>
              </button>
            )}
            <button
              onClick={() => onHireStaff(building.id)}
              disabled={!canHire}
              className="building-manager-button hire"
            >
              <UserPlus className="h-4 w-4" />
              <span>Hire (${config.staffCost.toLocaleString()})</span>
            </button>
            <button
              onClick={() => onPurchaseVehicle(building.id)}
              disabled={!canBuyVehicle}
              className="building-manager-button buy-vehicle"
            >
              <Plus className="h-4 w-4" />
              <span>Vehicle (${config.vehicleCost.toLocaleString()})</span>
            </button>
            <button
              onClick={() => { onSell(building.id); onClose() }}
              className="building-manager-button sell"
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
