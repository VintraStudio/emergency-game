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
import { GiTowTruck } from "react-icons/gi"
import { PiFireTruckFill } from "react-icons/pi"
import { GiAmbulance } from "react-icons/gi"
import { FaShieldAlt } from "react-icons/fa"
import { FaHeartbeat } from "react-icons/fa"
import { FaTruck } from "react-icons/fa"
import { renderToString } from "react-dom/server"
import "leaflet/dist/leaflet.css"
import "./city-map.css"





interface CityMapProps {
  city: CityConfig | null
  buildings: Building[]
  missions: Mission[]
  vehicles: Vehicle[]
  placingBuilding: BuildingType | null
  onPlaceBuilding: (type: BuildingType, position: LatLng) => void
  onSelectBuilding: (building: Building) => void
  onSelectMission: (mission: Mission) => void
  onOpenBuilding: (building: Building) => void
}

// --- SVG icon paths for each building type ---
const BUILDING_SVG_ICONS: Record<string, string> = {
  "fire-station": `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  "police-station": `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  "hospital": `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="M3 6h18v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/><path d="M10 14h4"/><path d="M12 12v4"/></svg>`,
  "ambulance-station": `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10h4"/><path d="M12 8v4"/><path d="M4 15h16"/><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></svg>`,
  "medical-clinic": `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><path d="M22 10 A2 2 0 0 0 20 8 A2 2 0 0 0 18 10"/></svg>`,
  "road-authority": `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="M14 6l7.7 7.7"/><path d="M8 6l8 8"/></svg>`,
  "morgue": `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>`,
}

// Get vehicle icon based on building type
function getVehicleIcon(buildingType: string, color: string, isWorking: boolean) {
  const iconProps = {
    size: 20,
    color: color,
    style: { 
      filter: isWorking ? 'drop-shadow(0 0 8px ' + color + ')' : 'drop-shadow(0 0 3px rgba(0,0,0,0.3))',
      transform: 'translate(-50%, -50%)'
    }
  }

  let iconComponent
  switch (buildingType) {
    case "fire-station":
      iconComponent = <PiFireTruckFill {...iconProps} />
      break
    case "police-station":
      iconComponent = <FaShieldAlt {...iconProps} />
      break
    case "hospital":
    case "ambulance-station":
    case "medical-clinic":
      iconComponent = <GiAmbulance {...iconProps} />
      break
    case "road-authority":
      iconComponent = <GiTowTruck {...iconProps} />
      break
    case "morgue":
      iconComponent = <FaTruck {...iconProps} />
      break
    default:
      iconComponent = <FaTruck {...iconProps} />
  }

  return renderToString(iconComponent)
}

function buildingIconHtml(color: string, level: number, size: number, buildingType: string) {
  const borderColor = color === "#ffffff" ? "#1a1c23" : color
  const svgIcon = BUILDING_SVG_ICONS[buildingType] || BUILDING_SVG_ICONS["fire-station"]
  return `<div class="map-icon-building" style="width:${size}px; height:${size}px; border-color:${borderColor}; color:${borderColor};">
    ${svgIcon}
    ${level > 1 ? `<div class="map-icon-badge" style="background:${borderColor};">${level}</div>` : ""}
  </div>`
}

function missionIconHtml(missionColor: string, isPending: boolean, urgencyRatio: number) {
  const barColor = urgencyRatio > 0.5 ? "#22c55e" : urgencyRatio > 0.25 ? "#f59e0b" : "#ef4444"
  const iconColor = isPending ? missionColor : "#475569"
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
  if (!city) {
    return null
  }

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
        center: [city!.center.lat, city!.center.lng],
        zoom: city!.zoom,
        zoomControl: false,
        attributionControl: false,
        minZoom: 10, // Tillater å zoome lenger ut (var 12)
        maxZoom: 19,
        zoomSnap: 0.5,
      })

      // Neutral gray map theme: CartoDB Positron (light gray) desaturated via CSS
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
    map.setView([city!.center.lat, city!.center.lng], city!.zoom)
  }, [city!.center.lat, city!.center.lng, city!.zoom])

  // Render vehicles and their routes, colored by parent building type
  useEffect(() => {
    const { vehicles: vLayer, routes: rLayer } = layersRef.current
    const L = leafletRef.current
    if (!vLayer || !rLayer || !L || !ready) return
  
    vLayer.clearLayers()
    rLayer.clearLayers()

    vehicles.forEach(v => {
      if (v.status === "idle") return
    
      // Look up the building this vehicle belongs to for color mapping
      const parentBuilding = buildings.find(b => b.id === v.buildingId)
      const bType = parentBuilding?.type || "fire-station"
      const config = BUILDING_CONFIGS[bType]
      const color = config?.color || "#3b82f6"

      // Draw remaining route from current position
      if (v.routeCoords && v.routeCoords.length > 0) {
        const startIdx = Math.floor(v.routeIndex)
        const remainingPath = v.routeCoords.slice(startIdx).map(c => [c.lat, c.lng] as [number, number])
        if (remainingPath.length > 1) {
          L.polyline(remainingPath, {
            color: color,
            weight: 4,
            opacity: 0.8,
            className: `vehicle-route-animated route-${bType}`
          }).addTo(rLayer)
        }
      }

      // Draw vehicle with icon
      const isWorking = v.status === "working"
      const vehicleIconHtml = getVehicleIcon(bType, color, isWorking)
      const vehicleIcon = L.divIcon({
        className: `vehicle-marker ${isWorking ? 'vehicle-working' : ''}`,
        iconSize: [24, 24], // Larger for icons
        iconAnchor: [12, 12], // Center the icon
        html: vehicleIconHtml
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
          html: buildingIconHtml(buildingColor, b.level, size, b.type),
        }),
        zIndexOffset: 100,
      })
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e) // Viktig: Ikke plasser nytt bygg når man klikker på et gammelt
        cb.current.onOpenBuilding(b)
      })
      marker.bindTooltip(`<b>${b.name}</b>`, { direction: "top", offset: [0, -14], className: "game-tooltip" })
      marker.addTo(layer)
    })
  }, [buildings, ready])

  // 3. Tegn Oppdrag
  useEffect(() => {
    const { missions: layer } = layersRef.current
    const L = leafletRef.current
    if (!layer || !L || !ready) return
    layer.clearLayers()

    missions.filter(m => m.status === "pending" || m.status === "dispatched").forEach(m => {
      const missionConfig = MISSION_CONFIGS[m.type]
      const missionColor = missionConfig?.color || "#ef4444"
      const marker = L.marker([m.position.lat, m.position.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [28, 36],
          iconAnchor: [14, 36],
          html: missionIconHtml(missionColor, m.status === "pending", m.timeRemaining / m.timeLimit),
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
