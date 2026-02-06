"use client"

import { useEffect, useRef, useCallback, useMemo } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { Building, Mission, Vehicle, LatLng, BuildingType, CityConfig } from "@/lib/game-types"
import { BUILDING_CONFIGS, MISSION_CONFIGS } from "@/lib/game-types"

interface CityMapProps {
  city: CityConfig
  buildings: Building[]
  missions: Mission[]
  vehicles: Vehicle[]
  placingBuilding: BuildingType | null
  onPlaceBuilding: (type: BuildingType, position: LatLng) => void
  onSelectBuilding: (building: Building) => void
  onSelectMission: (mission: Mission) => void
  onOpenBuilding: (building: Building) => void
}

// Custom icon factories
function createBuildingIcon(color: string, level: number): L.DivIcon {
  const size = 28 + (level - 1) * 6
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: hsl(220, 18%, 14%);
      border: 2px solid ${color};
      border-radius: 6px;
      box-shadow: 0 0 12px ${color}44;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      position: relative;
    ">
      <div style="
        width: 8px; height: 8px;
        background: ${color};
        border-radius: 50%;
      "></div>
      ${level > 1 ? `<div style="
        position: absolute; top: 2px; right: 2px;
        width: 10px; height: 10px;
        background: ${color};
        border-radius: 50%;
        font-size: 7px;
        color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-weight: bold;
      ">${level}</div>` : ""}
    </div>`,
  })
}

function createMissionIcon(color: string, isPending: boolean, urgencyRatio: number): L.DivIcon {
  const borderColor = urgencyRatio > 0.5 ? "#4ade80" : urgencyRatio > 0.25 ? "#ddaa22" : "#e04444"
  return L.divIcon({
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    html: `<div style="
      display: flex; flex-direction: column; align-items: center; gap: 2px;
    ">
      <div style="
        width: 26px; height: 26px;
        background: ${isPending ? color : "hsl(220, 14%, 22%)"};
        border: 2px solid ${color};
        border-radius: 50%;
        opacity: ${isPending ? 0.95 : 0.6};
        display: flex; align-items: center; justify-content: center;
        ${isPending ? `box-shadow: 0 0 14px ${color}66; animation: pulse 2s ease-in-out infinite;` : ""}
        cursor: pointer;
      ">
        <div style="
          width: 10px; height: 10px;
          background: ${isPending ? "#1a1e2e" : color};
          mask: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22currentColor%22><circle cx=%2212%22 cy=%2212%22 r=%226%22/></svg>');
          -webkit-mask: url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22currentColor%22><circle cx=%2212%22 cy=%2212%22 r=%226%22/></svg>');
        "></div>
      </div>
      ${isPending ? `<div style="
        width: 22px; height: 3px;
        background: rgba(0,0,0,0.5);
        border-radius: 2px;
        overflow: hidden;
      ">
        <div style="
          width: ${urgencyRatio * 100}%;
          height: 100%;
          background: ${borderColor};
          border-radius: 2px;
        "></div>
      </div>` : ""}
    </div>`,
  })
}

function createVehicleIcon(color: string, isWorking: boolean): L.DivIcon {
  const size = isWorking ? 14 : 10
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: ${isWorking ? color : "hsl(220, 18%, 14%)"};
      border: 2px solid ${color};
      border-radius: 50%;
      box-shadow: 0 0 8px ${color}66;
      ${isWorking ? "animation: pulse 1.5s ease-in-out infinite;" : ""}
    "></div>`,
  })
}

function createPlacementIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `<div style="
      width: 32px; height: 32px;
      background: ${color}33;
      border: 2px dashed ${color};
      border-radius: 6px;
      pointer-events: none;
    "></div>`,
  })
}

export function CityMap({
  city, buildings, missions, vehicles, placingBuilding,
  onPlaceBuilding, onSelectBuilding, onSelectMission, onOpenBuilding,
}: CityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const buildingLayerRef = useRef<L.LayerGroup>(L.layerGroup())
  const missionLayerRef = useRef<L.LayerGroup>(L.layerGroup())
  const vehicleLayerRef = useRef<L.LayerGroup>(L.layerGroup())
  const routeLayerRef = useRef<L.LayerGroup>(L.layerGroup())
  const ghostMarkerRef = useRef<L.Marker | null>(null)
  const placingRef = useRef<BuildingType | null>(null)

  // Keep placingRef in sync
  useEffect(() => {
    placingRef.current = placingBuilding
    const map = mapRef.current
    if (!map) return

    if (placingBuilding) {
      map.getContainer().style.cursor = "crosshair"
    } else {
      map.getContainer().style.cursor = ""
      if (ghostMarkerRef.current) {
        ghostMarkerRef.current.remove()
        ghostMarkerRef.current = null
      }
    }
  }, [placingBuilding])

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [city.center.lat, city.center.lng],
      zoom: city.zoom,
      zoomControl: false,
      attributionControl: false,
    })

    // Dark tiles for game aesthetic
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map)

    // Zoom control in bottom-right
    L.control.zoom({ position: "bottomright" }).addTo(map)

    // Add layers
    buildingLayerRef.current.addTo(map)
    missionLayerRef.current.addTo(map)
    vehicleLayerRef.current.addTo(map)
    routeLayerRef.current.addTo(map)

    // Click handler for placing buildings
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (placingRef.current) {
        onPlaceBuilding(placingRef.current, { lat: e.latlng.lat, lng: e.latlng.lng })
      }
    })

    // Mouse move for ghost placement marker
    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      if (!placingRef.current) return
      const color = BUILDING_CONFIGS[placingRef.current].color

      if (!ghostMarkerRef.current) {
        ghostMarkerRef.current = L.marker(e.latlng, {
          icon: createPlacementIcon(color),
          interactive: false,
        }).addTo(map)
      } else {
        ghostMarkerRef.current.setLatLng(e.latlng)
        ghostMarkerRef.current.setIcon(createPlacementIcon(color))
      }
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // Only initialize once -- city won't change after map creation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-center if city changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setView([city.center.lat, city.center.lng], city.zoom)
  }, [city])

  // Update buildings layer
  useEffect(() => {
    const layer = buildingLayerRef.current
    layer.clearLayers()

    for (const building of buildings) {
      const config = BUILDING_CONFIGS[building.type]
      const marker = L.marker([building.position.lat, building.position.lng], {
        icon: createBuildingIcon(config.color, building.level),
        zIndexOffset: 100,
      })

      marker.on("click", () => onSelectBuilding(building))
      marker.on("dblclick", () => onOpenBuilding(building))

      // Tooltip with building name
      marker.bindTooltip(
        `<div style="font-size: 11px; font-weight: 600;">${building.name}</div>
         <div style="font-size: 10px; opacity: 0.7;">Level ${building.level} - ${building.vehicles.length} vehicles</div>`,
        {
          direction: "top",
          offset: [0, -14],
          className: "game-tooltip",
        },
      )

      marker.addTo(layer)
    }
  }, [buildings, onSelectBuilding, onOpenBuilding])

  // Update missions layer
  useEffect(() => {
    const layer = missionLayerRef.current
    layer.clearLayers()

    const activeMissions = missions.filter((m) => m.status === "pending" || m.status === "dispatched")

    for (const mission of activeMissions) {
      const config = MISSION_CONFIGS[mission.type]
      const isPending = mission.status === "pending"
      const urgencyRatio = mission.timeRemaining / mission.timeLimit

      const marker = L.marker([mission.position.lat, mission.position.lng], {
        icon: createMissionIcon(config.color, isPending, urgencyRatio),
        zIndexOffset: 200,
      })

      marker.on("click", () => onSelectMission(mission))

      marker.bindTooltip(
        `<div style="font-size: 11px; font-weight: 600;">${mission.title}</div>
         <div style="font-size: 10px; opacity: 0.7;">${mission.timeRemaining}s remaining - $${mission.reward}</div>`,
        {
          direction: "top",
          offset: [0, -18],
          className: "game-tooltip",
        },
      )

      marker.addTo(layer)
    }
  }, [missions, onSelectMission])

  // Update vehicles and route lines
  useEffect(() => {
    const vehLayer = vehicleLayerRef.current
    const routeLayer = routeLayerRef.current
    vehLayer.clearLayers()
    routeLayer.clearLayers()

    const activeVehicles = vehicles.filter((v) => v.status !== "idle")

    for (const v of activeVehicles) {
      const building = buildings.find((b) => b.id === v.buildingId)
      const config = building ? BUILDING_CONFIGS[building.type] : null
      const color = config?.color || "#4ade80"
      const isWorking = v.status === "working"

      // Vehicle marker
      const marker = L.marker([v.position.lat, v.position.lng], {
        icon: createVehicleIcon(color, isWorking),
        zIndexOffset: 300,
        interactive: false,
      })
      marker.addTo(vehLayer)

      // Route trail
      if (v.routeCoords.length > 1 && v.routeIndex < v.routeCoords.length - 1) {
        const remainingRoute = v.routeCoords.slice(v.routeIndex).map((c) => [c.lat, c.lng] as [number, number])
        if (remainingRoute.length > 1) {
          const polyline = L.polyline(remainingRoute, {
            color,
            weight: 2,
            opacity: 0.35,
            dashArray: "6 8",
          })
          polyline.addTo(routeLayer)
        }
      }
    }
  }, [vehicles, buildings])

  return (
    <div className="relative flex-1 overflow-hidden rounded-lg border border-border">
      <div ref={containerRef} className="h-full w-full" />

      {/* Placement hint */}
      {placingBuilding && (
        <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-md border border-primary/30 bg-card/90 px-4 py-2 text-sm font-medium text-primary backdrop-blur-sm">
          Click on the map to place {BUILDING_CONFIGS[placingBuilding].name} -- Double-click buildings to manage
        </div>
      )}

      {/* Map hint when no buildings */}
      {buildings.length === 0 && !placingBuilding && (
        <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-md border border-border bg-card/90 px-4 py-2 text-xs text-muted-foreground backdrop-blur-sm">
          Scroll to zoom, drag to pan -- Double-click a placed building to manage it
        </div>
      )}
    </div>
  )
}
