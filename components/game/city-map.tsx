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
import { getCars, updateViewBounds, startTraffic, stopTraffic, tickTraffic } from "@/lib/traffic-manager"
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
  return `<div class="building-icon-container" style="width:${size}px; height:${size}px;">
    <div class="building-icon-main" style="width:${size}px; height:${size}px; border-color:${borderColor}; color:${borderColor};">
      ${svgIcon}
      ${level > 1 ? `<div class="building-icon-badge" style="background:${borderColor};">${level}</div>` : ""}
    </div>
  </div>`
}

// Zoomed-out mission icon: blinking alert dot with glow
function missionIconZoomedOut(missionColor: string, isPending: boolean, urgencyRatio: number) {
  const barColor = urgencyRatio > 0.5 ? "#22c55e" : urgencyRatio > 0.25 ? "#f59e0b" : "#ef4444"
  const iconColor = isPending ? missionColor : "#475569"
  return `<div class="mission-alert-container">
    <div class="mission-alert-ping" style="background:${iconColor};"></div>
    <div class="mission-alert-dot ${isPending ? 'mission-blink' : ''}" style="background:${iconColor}; box-shadow: 0 0 12px ${iconColor}, 0 0 24px ${iconColor}40;">
      <div class="mission-alert-inner" style="background:#fff;"></div>
    </div>
    ${isPending ? `<div class="mission-urgency-bar"><div style="width:${Math.max(0, Math.min(100, urgencyRatio * 100))}%; background:${barColor};"></div></div>` : ""}
  </div>`
}

// Zoomed-in mission icon: animated scene based on type
function missionIconZoomedIn(missionType: string, missionColor: string, isPending: boolean, urgencyRatio: number) {
  const barColor = urgencyRatio > 0.5 ? "#22c55e" : urgencyRatio > 0.25 ? "#f59e0b" : "#ef4444"
  let sceneHtml = ""

  switch (missionType) {
    case "fire":
      sceneHtml = `<div class="mission-scene mission-fire">
        <div class="fire-flame f1"></div>
        <div class="fire-flame f2"></div>
        <div class="fire-flame f3"></div>
        <div class="fire-ember e1"></div>
        <div class="fire-ember e2"></div>
      </div>`
      break
    case "traffic-accident":
      sceneHtml = `<div class="mission-scene mission-accident">
        <div class="accident-car c1"></div>
        <div class="accident-car c2"></div>
        <div class="accident-flash"></div>
        <div class="hazard-light h1"></div>
        <div class="hazard-light h2"></div>
      </div>`
      break
    case "medical-emergency":
      sceneHtml = `<div class="mission-scene mission-medical">
        <div class="medical-cross"></div>
        <div class="heartbeat-line">
          <div class="heartbeat-pulse"></div>
        </div>
      </div>`
      break
    case "crime":
      sceneHtml = `<div class="mission-scene mission-crime">
        <div class="police-light red"></div>
        <div class="police-light blue"></div>
        <div class="crime-shield"></div>
      </div>`
      break
    case "infrastructure":
      sceneHtml = `<div class="mission-scene mission-infra">
        <div class="infra-warning"></div>
        <div class="infra-gear"></div>
        <div class="infra-stripe"></div>
      </div>`
      break
    default:
      sceneHtml = `<div class="mission-scene"><div class="mission-alert-dot" style="background:${missionColor};"></div></div>`
  }

  return `<div class="mission-scene-container" style="border-color:${missionColor};">
    ${sceneHtml}
    ${isPending ? `<div class="mission-urgency-bar scene-bar"><div style="width:${Math.max(0, Math.min(100, urgencyRatio * 100))}%; background:${barColor};"></div></div>` : ""}
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
  const [zoomLevel, setZoomLevel] = useState(city?.zoom ?? 14)

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

      // ---- Panes: stable layering + no pointer steal ----
map.createPane("routesPane")
map.getPane("routesPane")!.style.zIndex = "300"
map.getPane("routesPane")!.style.pointerEvents = "none"

map.createPane("trafficPane")
map.getPane("trafficPane")!.style.zIndex = "400"
map.getPane("trafficPane")!.style.pointerEvents = "none"

map.createPane("vehiclesPane")
map.getPane("vehiclesPane")!.style.zIndex = "500"
map.getPane("vehiclesPane")!.style.pointerEvents = "none"

map.createPane("missionsPane")
map.getPane("missionsPane")!.style.zIndex = "650"
// missions can be clickable => DO NOT disable pointer-events here unless you want that

map.createPane("buildingsPane")
map.getPane("buildingsPane")!.style.zIndex = "800"

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

      // Track zoom level for zoom-based rendering
      map.on("zoomend", () => {
        setZoomLevel(map.getZoom())
        // Update traffic viewport bounds
        const b = map.getBounds()
        updateViewBounds({
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        })
      })

      // Update traffic bounds on map move
      map.on("moveend", () => {
        const b = map.getBounds()
        updateViewBounds({
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        })
      })

      // Initialize traffic system with current viewport
      const initialBounds = map.getBounds()
      updateViewBounds({
        north: initialBounds.getNorth(),
        south: initialBounds.getSouth(),
        east: initialBounds.getEast(),
        west: initialBounds.getWest(),
      })
      startTraffic()

      mapRef.current = map
      setReady(true)
    }

    init()
    return () => {
      isMounted = false
      stopTraffic()
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // Empty dependency - only run once

  // Re-center map when city changes - but prevent re-centering on every tick
  const cityRef = useRef(city)
  const prevCityRef = useRef<string>("")
  
  if (JSON.stringify(city) !== prevCityRef.current) {
    cityRef.current = city
    prevCityRef.current = JSON.stringify(city)
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map || !cityRef.current) return
    map.setView([cityRef.current.center.lat, cityRef.current.center.lng], cityRef.current.zoom)
  }, [prevCityRef.current]) // Only re-center when city actually changes

  // Render vehicles and their routes, colored by parent building type - ISOLATED FROM GAME STATE
  const vehiclesRef = useRef(vehicles)
  const prevVehiclesRef = useRef<string>("")
  
  if (JSON.stringify(vehicles) !== prevVehiclesRef.current) {
    vehiclesRef.current = vehicles
    prevVehiclesRef.current = JSON.stringify(vehicles)
  }

  useEffect(() => {
    const { vehicles: vLayer, routes: rLayer } = layersRef.current
    const L = leafletRef.current
    if (!vLayer || !rLayer || !L || !ready) return

    vLayer.clearLayers()
    rLayer.clearLayers()

    vehiclesRef.current.forEach(v => {
      if (v.status === "idle") return

      // Look up the building this vehicle belongs to for color mapping
      const parentBuilding = buildings.find(b => b.id === v.buildingId)
      const bType = parentBuilding?.type || "fire-station"
      const config = BUILDING_CONFIGS[bType]
      const vehicleColor = config?.color || "#3b82f6"
      const isWorking = v.status === "working"

      const vehicleIconHtml = isWorking
        ? `<div class="vehicle-parked-wrapper">${getVehicleIcon(bType, vehicleColor, true)}<div class="vehicle-parked-shadow" style="background:${vehicleColor};"></div></div>`
        : getVehicleIcon(bType, vehicleColor, false)
      const vehicleIcon = L.divIcon({
        className: `vehicle-marker ${isWorking ? 'vehicle-parked' : ''}`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        html: vehicleIconHtml
      })

      L.marker([v.position.lat, v.position.lng], {
        pane: "vehiclesPane",
        icon: vehicleIcon,
        interactive: false,
        zIndexOffset: 1000
      }).addTo(vLayer)
    })
  }, [prevVehiclesRef.current, ready]) // Only re-render when vehicles actually change

  // 2.5. NPC Traffic rendering via canvas overlay
  const trafficCanvasRef = useRef<HTMLCanvasElement | null>(null)
  
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    // Create canvas element for traffic rendering
    const canvas = document.createElement("canvas")
    canvas.style.position = "absolute"
    canvas.style.top = "0"
    canvas.style.left = "0"
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    canvas.style.pointerEvents = "none"
    canvas.style.zIndex = "400"
    
    const pane = map.getPane("trafficPane")
    if (pane) {
      pane.appendChild(canvas)
    }
    trafficCanvasRef.current = canvas

    function resizeCanvas() {
      const container = map!.getContainer()
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    }
    resizeCanvas()
    map.on("resize", resizeCanvas)

    // Render loop for traffic cars
    let frameId: ReturnType<typeof setInterval>
    
    function renderTraffic() {
      const ctx = canvas.getContext("2d")
      if (!ctx || !map) return

      const container = map.getContainer()
      if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
        canvas.width = container.clientWidth
        canvas.height = container.clientHeight
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const cars = getCars()
      for (const car of cars) {
        const point = map.latLngToContainerPoint([car.lat, car.lng])
        
        ctx.save()
        ctx.translate(point.x, point.y)
        ctx.rotate(-car.heading + Math.PI / 2)
        
        // Draw car body
        const w = car.width
        const h = w * 1.8
        ctx.fillStyle = car.color
        ctx.beginPath()
        ctx.roundRect(-w / 2, -h / 2, w, h, 1)
        ctx.fill()
        
        // Subtle shadow
        ctx.shadowColor = "rgba(0,0,0,0.3)"
        ctx.shadowBlur = 2
        ctx.shadowOffsetY = 1
        
        ctx.restore()
      }
    }

    frameId = setInterval(renderTraffic, 80) // ~12fps for smooth traffic

    return () => {
      clearInterval(frameId)
      map.off("resize", resizeCanvas)
      if (pane && canvas.parentNode === pane) {
        pane.removeChild(canvas)
      }
      trafficCanvasRef.current = null
    }
  }, [ready])

  // Rydd opp ghost marker når vi er ferdige med å bygge
  useEffect(() => {
    if (!placingBuilding && ghostMarkerRef.current) {
      ghostMarkerRef.current.remove()
      ghostMarkerRef.current = null
    }
  }, [placingBuilding])

  // 2. Tegn Bygninger - Only re-render when buildings structurally change
  // Use a serialized key to detect real changes (id, type, level, position)
  const buildingKeyRef = useRef("")
  const buildingMarkersRef = useRef<Map<string, LType.Marker>>(new Map())
  
  useEffect(() => {
    const { buildings: layer } = layersRef.current
    const L = leafletRef.current
    if (!layer || !L || !ready) return

    // Create a lightweight key from building properties that affect rendering
    const newKey = buildings.map(b => `${b.id}:${b.type}:${b.level}:${b.position.lat}:${b.position.lng}`).join("|")
    if (newKey === buildingKeyRef.current) return // No change - skip
    buildingKeyRef.current = newKey
    
    layer.clearLayers()
    const newMarkers = new Map<string, LType.Marker>()

    buildings.forEach((b) => {
      const size = 28 + (b.level - 1) * 6
      const config = BUILDING_CONFIGS[b.type]
      const buildingColor = config?.color || "#3b82f6"

      const marker = L.marker([b.position.lat, b.position.lng], {
        icon: L.divIcon({
          className: "building-icon-container",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: buildingIconHtml(buildingColor, b.level, size, b.type),
        }),
        pane: "buildingsPane",
        zIndexOffset: 1000,
        interactive: true,
        riseOnHover: false,
      })

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e.originalEvent || e)
        L.DomEvent.preventDefault(e.originalEvent || e)
        cb.current.onOpenBuilding(b)
      })

      marker.bindTooltip(`<b>${b.name}</b>`, {
        direction: "top",
        offset: [0, -14],
        className: "game-tooltip",
        sticky: false,
      })

      marker.addTo(layer)
      newMarkers.set(b.id, marker)
    })

    buildingMarkersRef.current = newMarkers
  }, [buildings, ready])

  // 3. Tegn Oppdrag - zoom-based icons
  const isZoomedIn = zoomLevel >= 15
  
  useEffect(() => {
    const { missions: layer } = layersRef.current
    const L = leafletRef.current
    if (!layer || !L || !ready) return
    layer.clearLayers()

    missions.filter(m => m.status === "pending" || m.status === "dispatched").forEach(m => {
      const missionConfig = MISSION_CONFIGS[m.type]
      const missionColor = missionConfig?.color || "#ef4444"
      const isPending = m.status === "pending"
      const urgency = m.timeRemaining / m.timeLimit

      const iconHtml = isZoomedIn
        ? missionIconZoomedIn(m.type, missionColor, isPending, urgency)
        : missionIconZoomedOut(missionColor, isPending, urgency)

      const iconSize: [number, number] = isZoomedIn ? [44, 52] : [28, 36]
      const iconAnchor: [number, number] = isZoomedIn ? [22, 52] : [14, 36]

      const marker = L.marker([m.position.lat, m.position.lng], {
        pane: "missionsPane",
        icon: L.divIcon({
          className: "",
          iconSize,
          iconAnchor,
          html: iconHtml,
        }),
        zIndexOffset: 200,
      })
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e)
        cb.current.onSelectMission(m)
      })
      marker.addTo(layer)
    })
  }, [missions, ready, isZoomedIn])

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
