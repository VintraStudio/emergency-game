"use client"

import { useRef, useState, useCallback, type MouseEvent } from "react"
import {
  Flame,
  Shield,
  Heart,
  Siren,
  Stethoscope,
  Construction,
  Building2,
  CarFront,
  HeartPulse,
  ShieldAlert,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import type { Building, Mission, Position, BuildingType, CityZone } from "@/lib/game-types"
import { BUILDING_CONFIGS, MISSION_CONFIGS } from "@/lib/game-types"

const BUILDING_ICONS: Record<string, typeof Flame> = {
  Flame,
  Shield,
  Heart,
  Siren,
  Stethoscope,
  Construction,
  Building2,
}

const MISSION_ICONS: Record<string, typeof Flame> = {
  Flame,
  CarFront,
  HeartPulse,
  ShieldAlert,
  AlertTriangle,
}

const CITY_ZONES: CityZone[] = [
  { id: "z1", type: "residential", name: "Elm Heights", position: { x: 60, y: 60 }, width: 160, height: 120 },
  { id: "z2", type: "commercial", name: "Downtown", position: { x: 280, y: 80 }, width: 200, height: 160 },
  { id: "z3", type: "residential", name: "Oak Park", position: { x: 540, y: 60 }, width: 180, height: 130 },
  { id: "z4", type: "industrial", name: "Steel District", position: { x: 60, y: 240 }, width: 180, height: 140 },
  { id: "z5", type: "public", name: "Civic Center", position: { x: 300, y: 300 }, width: 160, height: 120 },
  { id: "z6", type: "residential", name: "Riverside", position: { x: 520, y: 250 }, width: 200, height: 130 },
  { id: "z7", type: "commercial", name: "Market Square", position: { x: 100, y: 430 }, width: 180, height: 110 },
  { id: "z8", type: "public", name: "University", position: { x: 340, y: 470 }, width: 150, height: 100 },
  { id: "z9", type: "residential", name: "Hilltop", position: { x: 550, y: 430 }, width: 170, height: 120 },
]

const ROADS = [
  // Horizontal roads
  { x1: 0, y1: 200, x2: 800, y2: 200 },
  { x1: 0, y1: 400, x2: 800, y2: 400 },
  { x1: 60, y1: 50, x2: 740, y2: 50 },
  { x1: 60, y1: 560, x2: 740, y2: 560 },
  // Vertical roads
  { x1: 250, y1: 0, x2: 250, y2: 600 },
  { x1: 500, y1: 0, x2: 500, y2: 600 },
  { x1: 50, y1: 50, x2: 50, y2: 560 },
  { x1: 750, y1: 50, x2: 750, y2: 560 },
]

const ZONE_COLORS: Record<CityZone["type"], { fill: string; stroke: string; label: string }> = {
  residential: { fill: "rgba(74, 222, 128, 0.08)", stroke: "rgba(74, 222, 128, 0.25)", label: "rgb(74, 222, 128)" },
  commercial: { fill: "rgba(251, 191, 36, 0.08)", stroke: "rgba(251, 191, 36, 0.25)", label: "rgb(251, 191, 36)" },
  industrial: { fill: "rgba(156, 163, 175, 0.08)", stroke: "rgba(156, 163, 175, 0.25)", label: "rgb(156, 163, 175)" },
  public: { fill: "rgba(96, 165, 250, 0.08)", stroke: "rgba(96, 165, 250, 0.25)", label: "rgb(96, 165, 250)" },
}

interface CityMapProps {
  buildings: Building[]
  missions: Mission[]
  placingBuilding: BuildingType | null
  onPlaceBuilding: (type: BuildingType, position: Position) => void
  onSelectBuilding: (building: Building) => void
  onSelectMission: (mission: Mission) => void
}

export function CityMap({
  buildings,
  missions,
  placingBuilding,
  onPlaceBuilding,
  onSelectBuilding,
  onSelectMission,
}: CityMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 800, h: 600 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [hoverPos, setHoverPos] = useState<Position | null>(null)

  const getSvgPoint = useCallback(
    (e: MouseEvent) => {
      const svg = svgRef.current
      if (!svg) return { x: 0, y: 0 }
      const rect = svg.getBoundingClientRect()
      const scaleX = viewBox.w / rect.width
      const scaleY = viewBox.h / rect.height
      return {
        x: (e.clientX - rect.left) * scaleX + viewBox.x,
        y: (e.clientY - rect.top) * scaleY + viewBox.y,
      }
    },
    [viewBox],
  )

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (placingBuilding) return
      setIsPanning(true)
      setPanStart({ x: e.clientX, y: e.clientY })
    },
    [placingBuilding],
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (placingBuilding) {
        setHoverPos(getSvgPoint(e))
        return
      }
      if (!isPanning) return
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const dx = ((e.clientX - panStart.x) * viewBox.w) / rect.width
      const dy = ((e.clientY - panStart.y) * viewBox.h) / rect.height
      setViewBox((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
      setPanStart({ x: e.clientX, y: e.clientY })
    },
    [isPanning, panStart, viewBox, placingBuilding, getSvgPoint],
  )

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (placingBuilding) {
        const pos = getSvgPoint(e)
        onPlaceBuilding(placingBuilding, pos)
        setHoverPos(null)
        return
      }
      setIsPanning(false)
    },
    [placingBuilding, getSvgPoint, onPlaceBuilding],
  )

  const handleZoom = useCallback((factor: number) => {
    setViewBox((v) => {
      const cx = v.x + v.w / 2
      const cy = v.y + v.h / 2
      const nw = Math.max(200, Math.min(1200, v.w * factor))
      const nh = Math.max(150, Math.min(900, v.h * factor))
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
    })
  }, [])

  return (
    <div className="relative flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className={`h-full w-full ${placingBuilding ? "cursor-crosshair" : isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsPanning(false)
          setHoverPos(null)
        }}
      >
        {/* Background */}
        <rect x={viewBox.x - 200} y={viewBox.y - 200} width={viewBox.w + 400} height={viewBox.h + 400} fill="hsl(220, 20%, 8%)" />

        {/* Grid */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={viewBox.x - 200} y={viewBox.y - 200} width={viewBox.w + 400} height={viewBox.h + 400} fill="url(#grid)" />

        {/* Zones */}
        {CITY_ZONES.map((zone) => {
          const colors = ZONE_COLORS[zone.type]
          return (
            <g key={zone.id}>
              <rect
                x={zone.position.x}
                y={zone.position.y}
                width={zone.width}
                height={zone.height}
                rx={6}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={1}
                strokeDasharray="4 2"
              />
              <text
                x={zone.position.x + zone.width / 2}
                y={zone.position.y + 16}
                textAnchor="middle"
                fill={colors.label}
                fontSize={9}
                fontWeight={500}
                opacity={0.7}
              >
                {zone.name}
              </text>
            </g>
          )
        })}

        {/* Roads */}
        {ROADS.map((road, i) => (
          <line
            key={`road-${i}`}
            x1={road.x1}
            y1={road.y1}
            x2={road.x2}
            y2={road.y2}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={8}
            strokeLinecap="round"
          />
        ))}
        {ROADS.map((road, i) => (
          <line
            key={`road-center-${i}`}
            x1={road.x1}
            y1={road.y1}
            x2={road.x2}
            y2={road.y2}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
            strokeDasharray="8 6"
          />
        ))}

        {/* Buildings */}
        {buildings.map((building) => {
          const config = BUILDING_CONFIGS[building.type]
          const size = building.size === "large" ? 28 : 20
          return (
            <g
              key={building.id}
              onClick={(e) => {
                e.stopPropagation()
                onSelectBuilding(building)
              }}
              className="cursor-pointer"
            >
              <rect
                x={building.position.x - size / 2 - 3}
                y={building.position.y - size / 2 - 3}
                width={size + 6}
                height={size + 6}
                rx={4}
                fill={config.color}
                opacity={0.15}
              />
              <rect
                x={building.position.x - size / 2}
                y={building.position.y - size / 2}
                width={size}
                height={size}
                rx={3}
                fill="hsl(220, 18%, 15%)"
                stroke={config.color}
                strokeWidth={1.5}
              />
              <BuildingIcon
                iconName={config.icon}
                x={building.position.x}
                y={building.position.y}
                color={config.color}
                size={size * 0.5}
              />
              <text
                x={building.position.x}
                y={building.position.y + size / 2 + 12}
                textAnchor="middle"
                fill="hsl(210, 20%, 80%)"
                fontSize={7}
                fontWeight={500}
              >
                {building.name}
              </text>
            </g>
          )
        })}

        {/* Missions */}
        {missions
          .filter((m) => m.status === "pending" || m.status === "dispatched")
          .map((mission) => {
            const config = MISSION_CONFIGS[mission.type]
            const isPending = mission.status === "pending"
            const urgencyRatio = mission.timeRemaining / mission.timeLimit
            return (
              <g
                key={mission.id}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectMission(mission)
                }}
                className="cursor-pointer"
              >
                {/* Pulse ring */}
                {isPending && (
                  <circle
                    cx={mission.position.x}
                    cy={mission.position.y}
                    r={18}
                    fill="none"
                    stroke={config.color}
                    strokeWidth={1.5}
                    opacity={0.4}
                    className="animate-pulse-glow"
                  />
                )}
                <circle
                  cx={mission.position.x}
                  cy={mission.position.y}
                  r={12}
                  fill={isPending ? config.color : "hsl(220, 14%, 25%)"}
                  opacity={isPending ? 0.9 : 0.6}
                  stroke={config.color}
                  strokeWidth={1}
                />
                <MissionIcon
                  iconName={config.icon}
                  x={mission.position.x}
                  y={mission.position.y}
                  color={isPending ? "hsl(220, 20%, 10%)" : config.color}
                  size={10}
                />
                {/* Timer bar */}
                {isPending && (
                  <g>
                    <rect
                      x={mission.position.x - 14}
                      y={mission.position.y + 16}
                      width={28}
                      height={3}
                      rx={1.5}
                      fill="rgba(0,0,0,0.5)"
                    />
                    <rect
                      x={mission.position.x - 14}
                      y={mission.position.y + 16}
                      width={28 * urgencyRatio}
                      height={3}
                      rx={1.5}
                      fill={urgencyRatio > 0.5 ? "hsl(142, 60%, 45%)" : urgencyRatio > 0.25 ? "hsl(38, 90%, 55%)" : "hsl(0, 72%, 55%)"}
                    />
                  </g>
                )}
              </g>
            )
          })}

        {/* Vehicles in transit */}
        {buildings.flatMap((b) =>
          b.vehicles
            .filter((v) => v.status === "dispatched" && v.targetPosition)
            .map((v) => (
              <g key={v.id}>
                <line
                  x1={v.position.x}
                  y1={v.position.y}
                  x2={v.targetPosition!.x}
                  y2={v.targetPosition!.y}
                  stroke="hsl(142, 60%, 45%)"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                  opacity={0.4}
                />
                <circle cx={v.targetPosition!.x} cy={v.targetPosition!.y} r={4} fill="hsl(142, 60%, 45%)" opacity={0.6} />
              </g>
            )),
        )}

        {/* Placement ghost */}
        {placingBuilding && hoverPos && (
          <g opacity={0.6}>
            <rect
              x={hoverPos.x - 12}
              y={hoverPos.y - 12}
              width={24}
              height={24}
              rx={4}
              fill={BUILDING_CONFIGS[placingBuilding].color}
              stroke="white"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          </g>
        )}
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          onClick={() => handleZoom(0.8)}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-secondary"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleZoom(1.25)}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-secondary"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
      </div>

      {/* Placement hint */}
      {placingBuilding && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-primary/30 bg-card/90 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm">
          Click on the map to place {BUILDING_CONFIGS[placingBuilding].name}
        </div>
      )}
    </div>
  )
}

function BuildingIcon({
  iconName,
  x,
  y,
  color,
  size,
}: {
  iconName: string
  x: number
  y: number
  color: string
  size: number
}) {
  const Icon = BUILDING_ICONS[iconName]
  if (!Icon) return null
  return (
    <foreignObject x={x - size / 2} y={y - size / 2} width={size} height={size}>
      <div className="flex h-full w-full items-center justify-center">
        <Icon style={{ color, width: size * 0.8, height: size * 0.8 }} />
      </div>
    </foreignObject>
  )
}

function MissionIcon({
  iconName,
  x,
  y,
  color,
  size,
}: {
  iconName: string
  x: number
  y: number
  color: string
  size: number
}) {
  const Icon = MISSION_ICONS[iconName]
  if (!Icon) return null
  return (
    <foreignObject x={x - size / 2} y={y - size / 2} width={size} height={size}>
      <div className="flex h-full w-full items-center justify-center">
        <Icon style={{ color, width: size * 0.8, height: size * 0.8 }} />
      </div>
    </foreignObject>
  )
}
