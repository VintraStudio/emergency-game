"use client"

import { useRef, useState, useCallback, useMemo, type MouseEvent, type WheelEvent } from "react"
import {
  Flame, Shield, Heart, Siren, Stethoscope, Construction, Building2,
  CarFront, HeartPulse, ShieldAlert, AlertTriangle,
  ZoomIn, ZoomOut, Maximize2,
} from "lucide-react"
import type { Building, Mission, Vehicle, Position, BuildingType } from "@/lib/game-types"
import { BUILDING_CONFIGS, MISSION_CONFIGS } from "@/lib/game-types"
import { getDrawableRoads } from "@/lib/road-network"
import { CITY_ZONES, CITY_STRUCTURES, PARK_AREAS, ZONE_COLORS } from "@/lib/map-data"

const BUILDING_ICONS: Record<string, typeof Flame> = {
  Flame, Shield, Heart, Siren, Stethoscope, Construction, Building2,
}
const MISSION_ICONS: Record<string, typeof Flame> = {
  Flame, CarFront, HeartPulse, ShieldAlert, AlertTriangle,
}

const MAP_W = 1600
const MAP_H = 1000

interface CityMapProps {
  buildings: Building[]
  missions: Mission[]
  vehicles: Vehicle[]
  placingBuilding: BuildingType | null
  onPlaceBuilding: (type: BuildingType, position: Position) => void
  onSelectBuilding: (building: Building) => void
  onSelectMission: (mission: Mission) => void
  onOpenBuilding: (building: Building) => void
}

export function CityMap({
  buildings, missions, vehicles, placingBuilding,
  onPlaceBuilding, onSelectBuilding, onSelectMission, onOpenBuilding,
}: CityMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [viewBox, setViewBox] = useState({ x: 200, y: 100, w: 1000, h: 625 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [hoverPos, setHoverPos] = useState<Position | null>(null)

  const roads = useMemo(() => getDrawableRoads(), [])

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

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1.1 : 0.9
    setViewBox((v) => {
      const svg = svgRef.current
      if (!svg) return v
      const rect = svg.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * v.w + v.x
      const my = ((e.clientY - rect.top) / rect.height) * v.h + v.y
      const nw = Math.max(300, Math.min(1800, v.w * factor))
      const nh = Math.max(187, Math.min(1125, v.h * factor))
      return {
        x: mx - (mx - v.x) * (nw / v.w),
        y: my - (my - v.y) * (nh / v.h),
        w: nw,
        h: nh,
      }
    })
  }, [])

  const handleZoom = useCallback((factor: number) => {
    setViewBox((v) => {
      const cx = v.x + v.w / 2
      const cy = v.y + v.h / 2
      const nw = Math.max(300, Math.min(1800, v.w * factor))
      const nh = Math.max(187, Math.min(1125, v.h * factor))
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
    })
  }, [])

  const resetView = useCallback(() => {
    setViewBox({ x: 0, y: 0, w: MAP_W, h: MAP_H })
  }, [])

  // Active (moving / working) vehicles
  const activeVehicles = vehicles.filter((v) => v.status !== "idle")

  return (
    <div className="relative flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        className={`h-full w-full ${placingBuilding ? "cursor-crosshair" : isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onMouseLeave={() => { setIsPanning(false); setHoverPos(null) }}
      >
        {/* Background */}
        <rect x={-200} y={-200} width={MAP_W + 400} height={MAP_H + 400} fill="hsl(220, 20%, 7%)" />

        {/* Subtle grid */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.015)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={-200} y={-200} width={MAP_W + 400} height={MAP_H + 400} fill="url(#grid)" />

        {/* Zones */}
        {CITY_ZONES.map((zone) => {
          const colors = ZONE_COLORS[zone.type]
          return (
            <g key={zone.id}>
              <rect
                x={zone.position.x} y={zone.position.y}
                width={zone.width} height={zone.height}
                rx={4} fill={colors.fill} stroke={colors.stroke}
                strokeWidth={0.5} strokeDasharray="4 3"
              />
              <text
                x={zone.position.x + zone.width / 2} y={zone.position.y + 12}
                textAnchor="middle" fill={colors.label}
                fontSize={8} fontWeight={500}
              >
                {zone.name}
              </text>
            </g>
          )
        })}

        {/* Park areas - green fill */}
        {PARK_AREAS.map((park) => (
          <g key={park.id}>
            <rect
              x={park.position.x} y={park.position.y}
              width={park.width} height={park.height}
              rx={6} fill="rgba(34, 120, 60, 0.12)"
              stroke="rgba(34, 120, 60, 0.2)" strokeWidth={0.5}
            />
            {/* Trees */}
            {park.trees.map((t, i) => (
              <g key={`tree-${park.id}-${i}`}>
                <rect x={t.x - 1} y={t.y + 3} width={2} height={5} fill="hsl(30, 30%, 25%)" rx={0.5} />
                <circle cx={t.x} cy={t.y} r={4 + (i % 3)} fill={`hsl(${130 + (i % 5) * 8}, ${40 + (i % 3) * 10}%, ${22 + (i % 4) * 3}%)`} />
                <circle cx={t.x - 2} cy={t.y + 1} r={2.5 + (i % 2)} fill={`hsl(${125 + (i % 4) * 6}, ${35 + (i % 3) * 8}%, ${20 + (i % 3) * 2}%)`} />
              </g>
            ))}
            {/* Bushes */}
            {park.bushes.map((b, i) => (
              <ellipse
                key={`bush-${park.id}-${i}`}
                cx={b.x} cy={b.y}
                rx={3 + (i % 2)} ry={2 + (i % 2)}
                fill={`hsl(${135 + (i % 3) * 5}, 35%, ${18 + (i % 3) * 3}%)`}
              />
            ))}
          </g>
        ))}

        {/* Decorative city structures */}
        {CITY_STRUCTURES.map((s) => (
          <g key={s.id}>
            <rect
              x={s.position.x} y={s.position.y}
              width={s.width} height={s.height}
              rx={1.5} fill={s.color}
              stroke="rgba(255,255,255,0.04)" strokeWidth={0.3}
            />
            {/* Roof line / top accent */}
            <rect
              x={s.position.x} y={s.position.y}
              width={s.width} height={3}
              rx={1.5} fill={s.roofColor}
            />
            {/* Windows */}
            {s.type !== "factory" && Array.from({ length: Math.min(3, Math.floor(s.width / 10)) }).map((_, i) => (
              <rect
                key={`win-${s.id}-${i}`}
                x={s.position.x + 4 + i * 10}
                y={s.position.y + 7}
                width={4} height={4} rx={0.5}
                fill="rgba(200, 200, 120, 0.08)"
              />
            ))}
          </g>
        ))}

        {/* Roads */}
        {roads.map((road, i) => {
          const width = road.type === "highway" ? 14 : road.type === "main" ? 10 : 6
          const color = road.type === "highway"
            ? "rgba(255,255,255,0.12)"
            : road.type === "main"
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.05)"
          return (
            <g key={`road-${i}`}>
              <line
                x1={road.x1} y1={road.y1} x2={road.x2} y2={road.y2}
                stroke={color} strokeWidth={width} strokeLinecap="round"
              />
              {/* Center lane marking */}
              {road.type !== "side" && (
                <line
                  x1={road.x1} y1={road.y1} x2={road.x2} y2={road.y2}
                  stroke="rgba(255,255,255,0.03)" strokeWidth={1}
                  strokeDasharray={road.type === "highway" ? "12 8" : "6 6"}
                />
              )}
              {/* Highway edge lines */}
              {road.type === "highway" && (
                <>
                  <line
                    x1={road.x1} y1={road.y1} x2={road.x2} y2={road.y2}
                    stroke="rgba(255,200,50,0.08)" strokeWidth={0.5}
                    strokeDasharray="0"
                    transform={`translate(${road.y1 === road.y2 ? 0 : 5}, ${road.x1 === road.x2 ? 0 : 5})`}
                  />
                </>
              )}
            </g>
          )
        })}

        {/* Player buildings */}
        {buildings.map((building) => {
          const config = BUILDING_CONFIGS[building.type]
          const baseSize = building.size === "large" ? 30 : 22
          const size = baseSize + (building.level - 1) * 4
          return (
            <g key={building.id} className="cursor-pointer">
              {/* Glow */}
              <rect
                x={building.position.x - size / 2 - 5}
                y={building.position.y - size / 2 - 5}
                width={size + 10} height={size + 10}
                rx={6} fill={config.color} opacity={0.1}
              />
              {/* Building body */}
              <rect
                x={building.position.x - size / 2}
                y={building.position.y - size / 2}
                width={size} height={size}
                rx={4} fill="hsl(220, 18%, 14%)"
                stroke={config.color} strokeWidth={1.5}
                onClick={(e) => { e.stopPropagation(); onSelectBuilding(building) }}
                onDoubleClick={(e) => { e.stopPropagation(); onOpenBuilding(building) }}
              />
              {/* Level indicator */}
              {building.level > 1 && (
                <g>
                  {Array.from({ length: building.level - 1 }).map((_, li) => (
                    <circle
                      key={li}
                      cx={building.position.x - size / 2 + 5 + li * 6}
                      cy={building.position.y - size / 2 + 5}
                      r={2} fill={config.color}
                    />
                  ))}
                </g>
              )}
              {/* Icon */}
              <SvgIcon
                iconName={config.icon}
                icons={BUILDING_ICONS}
                x={building.position.x}
                y={building.position.y}
                color={config.color}
                size={size * 0.5}
              />
              {/* Label */}
              <text
                x={building.position.x}
                y={building.position.y + size / 2 + 11}
                textAnchor="middle" fill="hsl(210, 20%, 75%)"
                fontSize={7} fontWeight={500}
              >
                {building.name}
              </text>
            </g>
          )
        })}

        {/* Active missions */}
        {missions
          .filter((m) => m.status === "pending" || m.status === "dispatched")
          .map((mission) => {
            const config = MISSION_CONFIGS[mission.type]
            const isPending = mission.status === "pending"
            const urgencyRatio = mission.timeRemaining / mission.timeLimit
            return (
              <g
                key={mission.id}
                onClick={(e) => { e.stopPropagation(); onSelectMission(mission) }}
                className="cursor-pointer"
              >
                {isPending && (
                  <circle
                    cx={mission.position.x} cy={mission.position.y}
                    r={20} fill="none" stroke={config.color}
                    strokeWidth={1.5} opacity={0.3}
                    className="animate-pulse-glow"
                  />
                )}
                <circle
                  cx={mission.position.x} cy={mission.position.y}
                  r={13} fill={isPending ? config.color : "hsl(220, 14%, 22%)"}
                  opacity={isPending ? 0.9 : 0.6}
                  stroke={config.color} strokeWidth={1}
                />
                <SvgIcon
                  iconName={config.icon}
                  icons={MISSION_ICONS}
                  x={mission.position.x} y={mission.position.y}
                  color={isPending ? "hsl(220, 20%, 10%)" : config.color}
                  size={11}
                />
                {isPending && (
                  <g>
                    <rect
                      x={mission.position.x - 15} y={mission.position.y + 17}
                      width={30} height={3} rx={1.5} fill="rgba(0,0,0,0.5)"
                    />
                    <rect
                      x={mission.position.x - 15} y={mission.position.y + 17}
                      width={30 * urgencyRatio} height={3} rx={1.5}
                      fill={urgencyRatio > 0.5 ? "hsl(142, 60%, 45%)" : urgencyRatio > 0.25 ? "hsl(38, 90%, 55%)" : "hsl(0, 72%, 55%)"}
                    />
                  </g>
                )}
              </g>
            )
          })}

        {/* Active vehicles on the road */}
        {activeVehicles.map((v) => {
          const building = buildings.find((b) => b.id === v.buildingId)
          const config = building ? BUILDING_CONFIGS[building.type] : null
          const color = config?.color || "hsl(142, 60%, 45%)"
          const isWorking = v.status === "working"
          return (
            <g key={v.id}>
              {/* Vehicle trail to show path */}
              {v.path.length > 1 && v.pathIndex < v.path.length && (
                <polyline
                  points={[
                    `${v.position.x},${v.position.y}`,
                    ...v.path.slice(v.pathIndex).map((p) => `${p.x},${p.y}`),
                  ].join(" ")}
                  fill="none" stroke={color} strokeWidth={1}
                  strokeDasharray="3 4" opacity={0.25}
                />
              )}
              {/* Vehicle dot */}
              <circle
                cx={v.position.x} cy={v.position.y}
                r={isWorking ? 5 : 4}
                fill={isWorking ? color : "hsl(220, 18%, 14%)"}
                stroke={color} strokeWidth={1.5}
              />
              {isWorking && (
                <circle
                  cx={v.position.x} cy={v.position.y}
                  r={8} fill="none" stroke={color}
                  strokeWidth={1} opacity={0.3}
                  className="animate-pulse-glow"
                />
              )}
              {/* Direction indicator for moving vehicles */}
              {!isWorking && v.path.length > 0 && v.pathIndex < v.path.length && (
                <circle
                  cx={v.position.x} cy={v.position.y}
                  r={2} fill={color}
                />
              )}
            </g>
          )
        })}

        {/* Placement ghost */}
        {placingBuilding && hoverPos && (
          <g opacity={0.6}>
            <rect
              x={hoverPos.x - 14} y={hoverPos.y - 14}
              width={28} height={28} rx={4}
              fill={BUILDING_CONFIGS[placingBuilding].color}
              stroke="white" strokeWidth={1}
              strokeDasharray="3 2"
            />
          </g>
        )}
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          onClick={() => handleZoom(0.75)}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-secondary"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleZoom(1.33)}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-secondary"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={resetView}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-secondary"
          aria-label="Reset view"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Placement hint */}
      {placingBuilding && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-primary/30 bg-card/90 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm">
          Click on the map to place {BUILDING_CONFIGS[placingBuilding].name} -- Double-click buildings to manage
        </div>
      )}

      {/* Map hint when no buildings */}
      {buildings.length === 0 && !placingBuilding && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-border bg-card/90 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm">
          Scroll to zoom, drag to pan -- Double-click a placed building to manage it
        </div>
      )}
    </div>
  )
}

function SvgIcon({
  iconName, icons, x, y, color, size,
}: {
  iconName: string
  icons: Record<string, typeof Flame>
  x: number
  y: number
  color: string
  size: number
}) {
  const Icon = icons[iconName]
  if (!Icon) return null
  return (
    <foreignObject x={x - size / 2} y={y - size / 2} width={size} height={size}>
      <div className="flex h-full w-full items-center justify-center">
        <Icon style={{ color, width: size * 0.8, height: size * 0.8 }} />
      </div>
    </foreignObject>
  )
}
