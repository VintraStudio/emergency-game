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
import { BUILDING_CONFIGS } from "@/lib/game-types"
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

// --- Ikon-generatorer ---
function buildingIconHtml(color: string, level: number, size: number) {
  const borderColor = color === "#ffffff" ? "#1a1c23" : color
  return `<div class="map-icon-building" style="width:${size}px; height:${size}px; border-color:${borderColor};">
    <div class="map-icon-dot" style="background:${borderColor};"></div>
    ${level > 1 ? `<div class="map-icon-badge" style="background:${borderColor};">${level}</div>` : ""}
  </div>`
}

function missionIconHtml(color: string, isPending: boolean, urgencyRatio: number) {
  const barColor = urgencyRatio > 0.5 ? "#22c55e" : urgencyRatio > 0.25 ? "#f59e0b" : "#ef4444"
  const iconColor = isPending ? "#ef4444" : "#475569"
  return `<div class="map-icon-mission-container">
    <div class="map-icon-mission-circle ${isPending ? 'pulse' : ''}" style="background:${isPending ? iconColor : "rgba(255,255,255,0.9)"}; border-color:${iconColor};">
      <div class="map-icon-dot" style="background:${isPending ? "#fff" : iconColor};"></div>
    </div>
    ${isPending ? `<div class="mission-urgency-bar"><div style="width:${Math.max(0, Math.min(100, urgencyRatio * 100))}%; background:${barColor};"></div></div>` : ""}
  </div>`
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
  const layersRef = useRef<{
    buildings: LType.LayerGroup | null
    missions: LType.LayerGroup | null
    vehicles: LType.LayerGroup | null
    routes: LType.LayerGroup | null
  }>({ buildings: null, missions: null, vehicles: null, routes: null })
  
  const ghostMarkerRef = useRef<LType.Marker | null>(null)
  const [ready, setReady] = useState(false)

  // Callbacks ref for å unngå stale closures
  const cb = useRef({ onPlaceBuilding, onSelectBuilding, onSelectMission, onOpenBuilding })
  cb.current = { onPlaceBuilding, onSelectBuilding, onSelectMission, onOpenBuilding }

  // VIKTIG: Ref som sporer hva som bygges for Leaflet-eventer
  const placingRef = useRef<BuildingType | null>(null)
  placingRef.current = placingBuilding

  // 1. Initialisering
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let isMounted = true

    async function init() {
      const L = (await import("leaflet")).default
      if (!isMounted || !containerRef.current) return
      leafletRef.current = L

      const map = L.map(containerRef.current, {
        center: [city.center.lat, city.center.lng],
        zoom: city.zoom,
        zoomControl: false,
        attributionControl: false,
        minZoom: 10, // Tillater å zoome lenger ut (var 12)
        maxZoom: 19,
        zoomSnap: 0.5,
      })

      // Bruker "light_all" for et mye lysere kart-tema
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        className: "game-tile" 
      }).addTo(map)

      L.control.zoom({ position: "bottomright" }).addTo(map)

      layersRef.current = {
        buildings: L.layerGroup().addTo(map),
        missions: L.layerGroup().addTo(map),
        vehicles: L.layerGroup().addTo(map),
        routes: L.layerGroup().addTo(map),
      }

      // Håndter klikk for plassering
      map.on("click", (e) => {
        if (placingRef.current) {
          cb.current.onPlaceBuilding(placingRef.current, { lat: e.latlng.lat, lng: e.latlng.lng })
        }
      })

      // Håndter ghost marker (skygge under musa)
      map.on("mousemove", (e) => {
        if (!placingRef.current || !leafletRef.current) return
        const icon = leafletRef.current.divIcon({
          className: "placement-ghost-container",
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          html: `<div class="ghost-ring"></div>`
        })

        if (!ghostMarkerRef.current) {
          ghostMarkerRef.current = leafletRef.current.marker(e.latlng, { icon, interactive: false }).addTo(map)
        } else {
          ghostMarkerRef.current.setLatLng(e.latlng)
        }
      })

      mapRef.current = map
      setReady(true)
    }

    init()
    return () => { 
      isMounted = false
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // Empty dependency - only run once

  // Re-center map when city changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setView([city.center.lat, city.center.lng], city.zoom)
  }, [city.center.lat, city.center.lng, city.zoom])

  // TEGN KJØRETØY OG RUTER MED FARGER
  useEffect(() => {
    const { vehicles: vLayer, routes: rLayer } = layersRef.current
    const L = leafletRef.current
    if (!vLayer || !rLayer || !L || !ready) return
  
  vLayer.clearLayers()
  rLayer.clearLayers()

  vehicles.forEach(v => {
    if (v.status === "idle") return
    
    // Finn bygningen som kjøretøyet tilhører
    const parentBuilding = buildings.find(b => b.id === v.buildingId)
    const bType = parentBuilding?.type || "fire-station"
    const config = BUILDING_CONFIGS[bType]
    const color = config?.color || "#3b82f6"

      // Tegn ruten bilen følger
      if (v.routeCoords && v.routeCoords.length > 0) {
        const path = v.routeCoords.map(c => [c.lat, c.lng] as [number, number])
        L.polyline(path, {
          color: color,
          weight: 4,
          opacity: 0.7,
          className: `vehicle-route-animated route-${bType}`
        }).addTo(rLayer)
      }

      // Tegn selve bilen
      const vehicleIcon = L.divIcon({
        className: `vehicle-marker`,
        iconSize: [14, 14],
        html: `<div class="vehicle-dot vehicle-${bType}" style="background-color: ${color}; width: 12px; height: 12px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.3);"></div>`
      })

      L.marker([v.position.lat, v.position.lng], { 
        icon: vehicleIcon, 
        interactive: false,
        zIndexOffset: 1000 
      }).addTo(vLayer)
    })
  }, [vehicles, buildings, ready])
  
  // Rydd opp ghost marker når vi er ferdige med å bygge
  useEffect(() => {
    if (!placingBuilding && ghostMarkerRef.current) {
      ghostMarkerRef.current.remove()
      ghostMarkerRef.current = null
    }
  }, [placingBuilding])

  // 2. Tegn Bygninger
  useEffect(() => {
    const { buildings: layer } = layersRef.current
    const L = leafletRef.current
    if (!layer || !L || !ready) return
    layer.clearLayers()

    buildings.forEach(b => {
      const size = 28 + (b.level - 1) * 6
      const config = BUILDING_CONFIGS[b.type]
      const buildingColor = config?.color || "#3b82f6"
      const marker = L.marker([b.position.lat, b.position.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: buildingIconHtml(buildingColor, b.level, size),
        }),
        zIndexOffset: 100,
      })
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e) // Viktig: Ikke plasser nytt bygg når man klikker på et gammelt
        cb.current.onSelectBuilding(b)
      })
      marker.on("dblclick", () => cb.current.onOpenBuilding(b))
      marker.bindTooltip(`<b>${b.name}</b>`, { direction: "top", offset: [0, -14], className: "game-tooltip" })
      marker.addTo(layer)
    })
  }, [buildings, ready])

  // 3. Tegn Kjøretøy og Ruter
  useEffect(() => {
    const { vehicles: vLayer, routes: rLayer } = layersRef.current
    const L = leafletRef.current
    if (!vLayer || !rLayer || !L || !ready) return
    
    vLayer.clearLayers()
    rLayer.clearLayers()

    vehicles.forEach(v => {
      if (v.status === "idle") return
      const color = "#3b82f6"

      if (v.routeCoords && v.routeCoords.length > v.routeIndex) {
        const remainingPath = v.routeCoords.slice(v.routeIndex).map(c => [c.lat, c.lng] as [number, number])
        if (remainingPath.length > 1) {
          L.polyline(remainingPath, {
            color: color, weight: 3, opacity: 0.5, className: "vehicle-route-animated"
          }).addTo(rLayer)
        }
      }

      const vehicleIcon = L.divIcon({
        className: `vehicle-marker ${v.status === 'working' ? 'vehicle-working' : ''}`,
        iconSize: [12, 12],
        html: `<div style="background:${color}; width:100%; height:100%; border-radius:50%; border:2px solid #fff;"></div>`
      })

      L.marker([v.position.lat, v.position.lng], { icon: vehicleIcon, interactive: false, zIndexOffset: 500 }).addTo(vLayer)
    })
  }, [vehicles, ready])

  // 4. Tegn Oppdrag
  useEffect(() => {
    const { missions: layer } = layersRef.current
    const L = leafletRef.current
    if (!layer || !L || !ready) return
    layer.clearLayers()

    missions.filter(m => m.status === "pending" || m.status === "dispatched").forEach(m => {
      const marker = L.marker([m.position.lat, m.position.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [28, 36],
          iconAnchor: [14, 36],
          html: missionIconHtml("#ffffff", m.status === "pending", m.timeRemaining / m.timeLimit),
        }),
        zIndexOffset: 200,
      })
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e)
        cb.current.onSelectMission(m)
      })
      marker.addTo(layer)
    })
  }, [missions, ready])

  return (
    <div className={`city-map-container ${placingBuilding ? 'is-placing' : ''}`}>
      <div ref={containerRef} className="city-map-wrapper" />
      
      {!ready && (
        <div className="city-map-overlay">
          <div className="loader-card">
            <div className="city-map-spinner" />
            <span>Initialiserer kartsystem...</span>
          </div>
        </div>
      )}

      {placingBuilding && (
        <div className="map-hint placement">
          Plasser {BUILDING_CONFIGS[placingBuilding].name} på kartet
        </div>
      )}
    </div>
  )
}