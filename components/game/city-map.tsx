"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import type LType from "leaflet"
import type {
  Building,
  Mission,
  Vehicle,
  LatLng,
  BuildingType,
  CityConfig,
} from "@/lib/game-types"
import { BUILDING_CONFIGS, MISSION_CONFIGS } from "@/lib/game-types"
import "leaflet/dist/leaflet.css"
import "./city-map.css"

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

function buildingIconHtml(color: string, level: number, size: number) {
  return `<div style="
    width:${size}px;height:${size}px;
    background:rgba(14,16,24,0.85);
    border:2px solid ${color};
    border-radius:10px;
    box-shadow:0 0 12px ${color}44;
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;position:relative;
  ">
    <div style="width:8px;height:8px;background:${color};border-radius:999px;"></div>
    ${
      level > 1
        ? `<div style="
          position:absolute;top:4px;right:4px;
          min-width:16px;height:16px;padding:0 4px;
          background:${color};
          border-radius:999px;
          font-size:10px;line-height:16px;color:#0b0d12;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;
        ">${level}</div>`
        : ""
    }
  </div>`
}

function missionIconHtml(color: string, isPending: boolean, urgencyRatio: number) {
  const barColor =
    urgencyRatio > 0.5 ? "#4ade80" : urgencyRatio > 0.25 ? "#f59e0b" : "#ef4444"

  return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
    <div style="
      width:26px;height:26px;
      background:${isPending ? color : "rgba(14,16,24,0.85)"};
      border:2px solid ${color};border-radius:999px;
      opacity:${isPending ? 0.95 : 0.65};
      display:flex;align-items:center;justify-content:center;
      ${isPending ? `box-shadow:0 0 14px ${color}66;animation:pulse 2s ease-in-out infinite;` : ""}
      cursor:pointer;
    ">
      <div style="width:10px;height:10px;background:${isPending ? "#0b0d12" : color};border-radius:999px;"></div>
    </div>
    ${
      isPending
        ? `<div style="
          width:26px;height:4px;
          background:rgba(255,255,255,0.12);
          border-radius:999px;overflow:hidden;
        "><div style="
          width:${Math.max(0, Math.min(100, urgencyRatio * 100))}%;
          height:100%;
          background:${barColor};
          border-radius:999px;
        "></div></div>`
        : ""
    }
  </div>`
}

function vehicleIconHtml(color: string, isWorking: boolean) {
  const size = isWorking ? 14 : 10
  return `<div style="
    width:${size}px;height:${size}px;
    background:${isWorking ? color : "rgba(14,16,24,0.85)"};
    border:2px solid ${color};border-radius:999px;
    box-shadow:0 0 8px ${color}66;
    ${isWorking ? "animation:pulse 1.5s ease-in-out infinite;" : ""}
  "></div>`
}

function placementIconHtml(color: string) {
  return `<div style="
    width:32px;height:32px;
    background:${color}22;
    border:2px dashed ${color};
    border-radius:10px;
    pointer-events:none;
    box-shadow:0 0 16px ${color}44;
  "></div>`
}


export function CityMap({
  city,
  buildings,
  missions,
  vehicles,
  placingBuilding,
  onPlaceBuilding,
  onSelectBuilding,
  onSelectMission,
  onOpenBuilding,
}: CityMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LType.Map | null>(null)
  const leafletRef = useRef<typeof LType | null>(null)
  const buildingLayerRef = useRef<LType.LayerGroup | null>(null)
  const missionLayerRef = useRef<LType.LayerGroup | null>(null)
  const vehicleLayerRef = useRef<LType.LayerGroup | null>(null)
  const routeLayerRef = useRef<LType.LayerGroup | null>(null)
  const ghostMarkerRef = useRef<LType.Marker | null>(null)
  const placingRef = useRef<BuildingType | null>(null)
  const [ready, setReady] = useState(false)

  const onPlaceBuildingRef = useRef(onPlaceBuilding)
  onPlaceBuildingRef.current = onPlaceBuilding
  const onSelectBuildingRef = useRef(onSelectBuilding)
  onSelectBuildingRef.current = onSelectBuilding
  const onSelectMissionRef = useRef(onSelectMission)
  onSelectMissionRef.current = onSelectMission
  const onOpenBuildingRef = useRef(onOpenBuilding)
  onOpenBuildingRef.current = onOpenBuilding

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

  // Initialize map with dynamic import
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    async function init() {
      const leaflet = (await import("leaflet")).default

      if (cancelled || !containerRef.current) return
      leafletRef.current = leaflet

      const map = leaflet.map(containerRef.current, {
        center: [city.center.lat, city.center.lng],
        zoom: city.zoom,
        zoomControl: false,
        attributionControl: false,
      })

      leaflet
        .tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          { maxZoom: 19, subdomains: "abcd" },
        )
        .addTo(map)

      leaflet.control.zoom({ position: "bottomright" }).addTo(map)

      buildingLayerRef.current = leaflet.layerGroup().addTo(map)
      missionLayerRef.current = leaflet.layerGroup().addTo(map)
      vehicleLayerRef.current = leaflet.layerGroup().addTo(map)
      routeLayerRef.current = leaflet.layerGroup().addTo(map)

      map.on("click", (e) => {
        if (placingRef.current) {
          onPlaceBuildingRef.current(placingRef.current, {
            lat: e.latlng.lat,
            lng: e.latlng.lng,
          })
        }
      })

      map.on("mousemove", (e) => {
        if (!placingRef.current || !leafletRef.current) return
        const ll = leafletRef.current
        const color = "#ffffff"
        const icon = ll.divIcon({
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          html: placementIconHtml(color),
        })

        if (!ghostMarkerRef.current) {
          ghostMarkerRef.current = ll
            .marker(e.latlng, { icon, interactive: false })
            .addTo(map)
        } else {
          ghostMarkerRef.current.setLatLng(e.latlng)
          ghostMarkerRef.current.setIcon(icon)
        }
      })

      mapRef.current = map
      setReady(true)
    }

    init()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-center if city changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setView([city.center.lat, city.center.lng], city.zoom)
  }, [city])

  // Update buildings
  useEffect(() => {
    const layer = buildingLayerRef.current
    const ll = leafletRef.current
    if (!layer || !ll || !ready) return
    layer.clearLayers()

    for (const building of buildings) {
      const color = "#ffffff"
      const size = 28 + (building.level - 1) * 6
      const marker = ll.marker([building.position.lat, building.position.lng], {
        icon: ll.divIcon({
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: buildingIconHtml(color, building.level, size),
        }),
        zIndexOffset: 100,
      })

      marker.on("click", () => onSelectBuildingRef.current(building))
      marker.on("dblclick", () => onOpenBuildingRef.current(building))

      marker.bindTooltip(
        `<div style="font-size:11px;font-weight:600;">${building.name}</div>
         <div style="font-size:10px;opacity:0.7;">Level ${building.level} - ${building.vehicles.length} vehicles</div>`,
        { direction: "top", offset: [0, -14], className: "game-tooltip" },
      )

      marker.addTo(layer)
    }
  }, [buildings, ready])

  // Update missions
  useEffect(() => {
    const layer = missionLayerRef.current
    const ll = leafletRef.current
    if (!layer || !ll || !ready) return
    layer.clearLayers()

    const active = missions.filter(
      (m) => m.status === "pending" || m.status === "dispatched",
    )

    for (const mission of active) {
      const color = "#ffffff"
      const isPending = mission.status === "pending"
      const urgencyRatio = mission.timeRemaining / mission.timeLimit

      const marker = ll.marker([mission.position.lat, mission.position.lng], {
        icon: ll.divIcon({
          className: "",
          iconSize: [28, 36],
          iconAnchor: [14, 36],
          html: missionIconHtml(color, isPending, urgencyRatio),
        }),
        zIndexOffset: 200,
      })

      marker.on("click", () => onSelectMissionRef.current(mission))

      marker.bindTooltip(
        `<div style="font-size:11px;font-weight:600;">${mission.title}</div>
         <div style="font-size:10px;opacity:0.7;">${mission.timeRemaining}s remaining - $${mission.reward}</div>`,
        { direction: "top", offset: [0, -18], className: "game-tooltip" },
      )

      marker.addTo(layer)
    }
  }, [missions, ready])

  // Update vehicles and routes
  useEffect(() => {
    const vehLayer = vehicleLayerRef.current
    const routeLayer = routeLayerRef.current
    const ll = leafletRef.current
    if (!vehLayer || !routeLayer || !ll || !ready) return
    vehLayer.clearLayers()
    routeLayer.clearLayers()

    const activeVehicles = vehicles.filter((v) => v.status !== "idle")

    for (const v of activeVehicles) {
      const building = buildings.find((b) => b.id === v.buildingId)
      const config = building ? BUILDING_CONFIGS[building.type] : null
      const color = "#ffffff"
      const isWorking = v.status === "working"
      const size = isWorking ? 14 : 10

      ll.marker([v.position.lat, v.position.lng], {
        icon: ll.divIcon({
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: vehicleIconHtml(color, isWorking),
        }),
        zIndexOffset: 300,
        interactive: false,
      }).addTo(vehLayer)

      if (v.routeCoords.length > 1 && v.routeIndex < v.routeCoords.length - 1) {
        const remaining = v.routeCoords
          .slice(v.routeIndex)
          .map((c) => [c.lat, c.lng] as [number, number])
        if (remaining.length > 1) {
          ll.polyline(remaining, {
            color,
            weight: 2,
            opacity: 0.35,
            dashArray: "6 8",
          }).addTo(routeLayer)
        }
      }
    }
  }, [vehicles, buildings, ready])

  return (
    <div className="city-map-container">
      <div ref={containerRef} className="city-map-wrapper" />

      {!ready && (
        <div className="city-map-loading">
          <div className="city-map-loading-content">
            <div className="city-map-spinner" />
            <span className="city-map-loading-text">
              Loading map...
            </span>
          </div>
        </div>
      )}

      {placingBuilding && ready && (
        <div className="city-map-placement-hint">
          Click on map to place{" "}
          {BUILDING_CONFIGS[placingBuilding].name} -- Double-click buildings
          to manage
        </div>
      )}

      {buildings.length === 0 && !placingBuilding && ready && (
        <div className="city-map-empty-hint">
          Scroll to zoom, drag to pan -- Double-click a placed building to
          manage it
        </div>
      )}
    </div>
  )
}
