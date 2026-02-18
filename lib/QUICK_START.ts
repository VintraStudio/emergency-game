/**
 * QUICK START: Integrating NPC Traffic System into Your Game
 * 
 * This file shows the minimal code needed to add the traffic system to your game loop.
 */

// ============================================================================
// STEP 1: Import the system
// ============================================================================
import { TrafficSystem } from "./lib/traffic/traffic-system"
import { ViewportBounds } from "./lib/traffic/spatial-grid"
import { VehicleType } from "./lib/traffic/vehicle-controller"

// ============================================================================
// STEP 2: In your game initialization
// ============================================================================
let trafficSystem: TrafficSystem

function initializeGame() {
  // Define the viewport (visible game area)
  const viewportBounds: ViewportBounds = {
    north: 59.935,
    south: 59.895,
    east: 10.795,
    west: 10.710,
  }

  // Create the traffic system
  trafficSystem = new TrafficSystem(viewportBounds, {
    maxVehicles: 50, // Adjust based on your target device
    gridSize: 5,
    timeScale: 1.0, // 1.0 = real time, 2.0 = 2x speed
    enableEmergencies: true,
    enableTrafficLights: true,
  })

  // Spawn initial traffic
  for (let i = 0; i < 30; i++) {
    spawnRandomVehicle()
  }
}

// ============================================================================
// STEP 3: Update traffic in your main game loop
// ============================================================================
function gameUpdate(deltaTime: number) {
  // Update all traffic (this is the critical line)
  trafficSystem.update(deltaTime)

  // Do your other game logic...
}

// ============================================================================
// STEP 4: Render the traffic
// ============================================================================
function gameRender(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  // Clear canvas
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)

  // Draw roads
  drawRoads(context, canvas)

  // Draw vehicles
  drawVehicles(context, canvas)

  // Draw debug info
  drawDebugInfo(context)
}

function drawVehicles(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const viewportBounds = getViewportBounds()
  const vehicles = trafficSystem.getViewportVehicles()

  for (const vehicle of vehicles) {
    // Convert world coordinates to screen coordinates
    const screenX = ((vehicle.position.lng - viewportBounds.west) / (viewportBounds.east - viewportBounds.west)) * canvas.width
    const screenY = ((viewportBounds.north - vehicle.position.lat) / (viewportBounds.north - viewportBounds.south)) * canvas.height

    // Determine color based on vehicle type
    let color = "#888888"
    if (vehicle.isEmergency) {
      if (vehicle.type === "fire-truck") color = "#ff0000"
      else if (vehicle.type === "ambulance") color = "#ff6600"
      else if (vehicle.type === "police-car") color = "#0000ff"
    }

    // Draw vehicle
    context.fillStyle = color
    context.beginPath()
    context.arc(screenX, screenY, 4, 0, Math.PI * 2)
    context.fill()

    // Draw direction indicator
    if (vehicle.velocity > 0) {
      context.strokeStyle = color
      context.lineWidth = 2
      const length = 8
      const endX = screenX + Math.cos(vehicle.heading) * length
      const endY = screenY + Math.sin(vehicle.heading) * length
      context.beginPath()
      context.moveTo(screenX, screenY)
      context.lineTo(endX, endY)
      context.stroke()
    }
  }
}

function drawRoads(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const viewportBounds = getViewportBounds()
  const graph = trafficSystem.getRoadGraph()
  const segments = graph.getAllEdges()

  context.lineWidth = 2
  context.globalAlpha = 0.6

  for (const segment of segments) {
    const fromNode = graph.getNode(segment.fromNodeId)
    const toNode = graph.getNode(segment.toNodeId)

    if (!fromNode || !toNode) continue

    // Convert to screen coordinates
    const x1 = ((fromNode.position.lng - viewportBounds.west) / (viewportBounds.east - viewportBounds.west)) * canvas.width
    const y1 = ((viewportBounds.north - fromNode.position.lat) / (viewportBounds.north - viewportBounds.south)) * canvas.height
    const x2 = ((toNode.position.lng - viewportBounds.west) / (viewportBounds.east - viewportBounds.west)) * canvas.width
    const y2 = ((viewportBounds.north - toNode.position.lat) / (viewportBounds.north - viewportBounds.south)) * canvas.height

    // Color based on congestion
    const density = graph.getSegmentDensity(segment.id)
    if (density > 0.85) context.strokeStyle = "#ff0000"
    else if (density > 0.6) context.strokeStyle = "#ffaa00"
    else if (density > 0.3) context.strokeStyle = "#ffff00"
    else context.strokeStyle = "#00ff00"

    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()
  }

  context.globalAlpha = 1.0
}

function drawDebugInfo(context: CanvasRenderingContext2D) {
  const stats = trafficSystem.getStats()

  context.fillStyle = "#000000"
  context.font = "12px monospace"

  let y = 20
  const lineHeight = 16

  context.fillText(`Vehicles: ${stats.totalVehicles}`, 10, y)
  y += lineHeight
  context.fillText(`In View: ${stats.vehiclesInViewport}`, 10, y)
  y += lineHeight
  context.fillText(`Congestion: ${(stats.congestionLevel * 100).toFixed(1)}%`, 10, y)
  y += lineHeight
  context.fillText(`Avg Speed: ${stats.averageSpeed.toFixed(5)}`, 10, y)
  y += lineHeight
  context.fillText(`Update: ${stats.updateTimeMs.toFixed(2)}ms`, 10, y)
}

// ============================================================================
// STEP 5: Handle player events
// ============================================================================

function spawnRandomVehicle() {
  const graph = trafficSystem.getRoadGraph()
  const nodes = graph.getAllNodes()

  if (nodes.length < 2) return

  const startNode = nodes[Math.floor(Math.random() * nodes.length)]
  const endNode = nodes[Math.floor(Math.random() * nodes.length)]

  if (startNode.id !== endNode.id) {
    trafficSystem.spawnVehicle(startNode.position, endNode.position, VehicleType.REGULAR_CAR)
  }
}

function handleEmergencyCall(x: number, y: number) {
  // Convert screen coordinates to world coordinates
  const viewportBounds = getViewportBounds()
  const emergencyLocation = {
    lat: viewportBounds.north - (y / (canvas.height)) * (viewportBounds.north - viewportBounds.south),
    lng: viewportBounds.west + (x / (canvas.width)) * (viewportBounds.east - viewportBounds.west),
  }

  // Spawn emergency vehicle
  const types = [VehicleType.FIRE_TRUCK, VehicleType.AMBULANCE, VehicleType.POLICE_CAR]
  const randomType = types[Math.floor(Math.random() * types.length)]

  trafficSystem.spawnEmergencyVehicle(
    { lat: 59.915, lng: 10.748 }, // Starting location (station)
    emergencyLocation,
    randomType,
  )

  console.log(`[Event] Emergency dispatched to (${emergencyLocation.lat.toFixed(4)}, ${emergencyLocation.lng.toFixed(4)})`)
}

// ============================================================================
// STEP 6: Handle viewport changes
// ============================================================================

function onCameraMove(newViewportBounds: ViewportBounds) {
  trafficSystem.setViewportBounds(newViewportBounds)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getViewportBounds(): ViewportBounds {
  // Return current viewport - adapt this to your camera system
  return {
    north: 59.935,
    south: 59.895,
    east: 10.795,
    west: 10.710,
  }
}

// ============================================================================
// EXAMPLE: Setting up the game loop
// ============================================================================

let canvas: HTMLCanvasElement
let context: CanvasRenderingContext2D
let lastFrameTime = Date.now()

export function startGame(canvasElement: HTMLCanvasElement) {
  canvas = canvasElement
  context = canvas.getContext("2d")!

  initializeGame()

  function loop() {
    const now = Date.now()
    const deltaTime = (now - lastFrameTime) / 1000 // Convert to seconds
    lastFrameTime = now

    gameUpdate(deltaTime)
    gameRender(context, canvas)

    requestAnimationFrame(loop)
  }

  requestAnimationFrame(loop)
}

// ============================================================================
// CONFIGURATION EXAMPLES
// ============================================================================

// For slower devices: reduce vehicle count and update frequency
export const SLOW_DEVICE_CONFIG = {
  maxVehicles: 30,
  gridSize: 4,
  timeScale: 1.0,
  enableEmergencies: true,
  enableTrafficLights: false,
}

// For fast devices: more vehicles and features
export const FAST_DEVICE_CONFIG = {
  maxVehicles: 80,
  gridSize: 6,
  timeScale: 1.0,
  enableEmergencies: true,
  enableTrafficLights: true,
}

// ============================================================================
// ADVANCED: Monitor Performance
// ============================================================================

export function monitorPerformance() {
  const stats = trafficSystem.getStats()

  console.group("[Traffic System Performance]")
  console.log("Total Vehicles:", stats.totalVehicles)
  console.log("Vehicles in Viewport:", stats.vehiclesInViewport)
  console.log("Average Speed:", stats.averageSpeed.toFixed(5))
  console.log("Network Congestion:", `${(stats.congestionLevel * 100).toFixed(1)}%`)
  console.log("Update Time:", `${stats.updateTimeMs.toFixed(2)}ms`)
  console.log("Grid Cells Active:", stats.gridStats.totalCells)
  console.log("Avg Vehicles per Cell:", stats.gridStats.avgVehiclesPerCell.toFixed(2))
  console.groupEnd()
}

// Call every 5 seconds
setInterval(monitorPerformance, 5000)
