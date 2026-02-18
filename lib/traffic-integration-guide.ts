/**
 * NPC Traffic System - Integration Guide and Usage Examples
 * 
 * This module demonstrates how to use the comprehensive NPC pathing and traffic system
 * in your game or simulation.
 */

import { TrafficSystem } from "./traffic/traffic-system"
import { PerformanceOptimizer } from "./traffic/performance-optimizer"
import { LatLng } from "./pathfinding/road-graph"
import { VehicleType } from "./traffic/vehicle-controller"
import { ViewportBounds } from "./traffic/spatial-grid"

/**
 * Example 1: Basic Traffic System Initialization
 */
export function initializeTrafficSystem(): TrafficSystem {
  // Define viewport bounds (example: Oslo city center)
  const viewportBounds: ViewportBounds = {
    north: 59.935,
    south: 59.895,
    east: 10.795,
    west: 10.710,
  }

  // Create traffic system with configuration
  const trafficSystem = new TrafficSystem(viewportBounds, {
    maxVehicles: 50, // 40-60 recommended
    gridSize: 5, // 5x5 intersection grid
    timeScale: 1.0, // 1.0 = normal speed
    enableEmergencies: true,
    enableTrafficLights: true,
  })

  return trafficSystem
}

/**
 * Example 2: Main Game Loop Integration
 */
export class GameLoop {
  private trafficSystem: TrafficSystem
  private performanceOptimizer: PerformanceOptimizer
  private lastUpdateTime: number = Date.now()
  private isRunning: boolean = false

  constructor() {
    this.trafficSystem = initializeTrafficSystem()
    this.performanceOptimizer = new PerformanceOptimizer()
  }

  /**
   * Start the game loop
   */
  start(): void {
    this.isRunning = true
    this.update()
  }

  /**
   * Stop the game loop
   */
  stop(): void {
    this.isRunning = false
  }

  /**
   * Main update loop - call this every frame
   */
  private update(): void {
    if (!this.isRunning) return

    const now = Date.now()
    const deltaTime = (now - this.lastUpdateTime) / 1000 // Convert to seconds
    this.lastUpdateTime = now

    // Update traffic system
    this.trafficSystem.update(deltaTime)

    // Record frame timing for performance monitoring
    this.performanceOptimizer.recordFrameTime(deltaTime * 1000)

    // Get current statistics
    const stats = this.trafficSystem.getStats()
    console.log(`[Traffic] Vehicles: ${stats.totalVehicles}, Viewport: ${stats.vehiclesInViewport}, Congestion: ${(stats.congestionLevel * 100).toFixed(1)}%`)

    // Continue loop
    requestAnimationFrame(() => this.update())
  }

  /**
   * Spawn regular traffic vehicles
   */
  spawnTrafficVehicles(count: number): void {
    const graph = this.trafficSystem.getRoadGraph()
    const nodes = graph.getAllNodes()

    for (let i = 0; i < count; i++) {
      // Random start and end nodes
      const startNode = nodes[Math.floor(Math.random() * nodes.length)]
      const endNode = nodes[Math.floor(Math.random() * nodes.length)]

      if (startNode && endNode && startNode.id !== endNode.id) {
        this.trafficSystem.spawnVehicle(
          startNode.position,
          endNode.position,
          VehicleType.REGULAR_CAR,
        )
      }
    }
  }

  /**
   * Spawn emergency vehicle (fire truck, ambulance, police)
   */
  spawnEmergencyVehicle(type: VehicleType, destination: LatLng): void {
    const graph = this.trafficSystem.getRoadGraph()
    const nodes = graph.getAllNodes()
    const startNode = nodes[Math.floor(Math.random() * nodes.length)]

    if (startNode) {
      this.trafficSystem.spawnEmergencyVehicle(startNode.position, destination, type)
    }
  }

  /**
   * Update viewport (when camera moves)
   */
  updateViewport(bounds: ViewportBounds): void {
    this.trafficSystem.setViewportBounds(bounds)
  }

  /**
   * Get traffic system reference
   */
  getTrafficSystem(): TrafficSystem {
    return this.trafficSystem
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const stats = this.trafficSystem.getStats()
    return {
      fps: this.performanceOptimizer.getCurrentFPS(),
      totalVehicles: stats.totalVehicles,
      vehiclesInViewport: stats.vehiclesInViewport,
      averageSpeed: stats.averageSpeed,
      congestionLevel: stats.congestionLevel,
      updateTime: stats.updateTimeMs,
    }
  }
}

/**
 * Example 3: Rendering NPC Vehicles (Canvas/WebGL example)
 */
export function renderTrafficVehicles(
  context: CanvasRenderingContext2D,
  trafficSystem: TrafficSystem,
  viewportBounds: ViewportBounds,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const vehicles = trafficSystem.getViewportVehicles()

  for (const vehicle of vehicles) {
    // Convert world coordinates to screen coordinates
    const screenX = ((vehicle.position.lng - viewportBounds.west) / (viewportBounds.east - viewportBounds.west)) * canvasWidth
    const screenY = ((viewportBounds.north - vehicle.position.lat) / (viewportBounds.north - viewportBounds.south)) * canvasHeight

    // Determine color based on vehicle state and type
    let color = "#888888" // Default gray for regular traffic
    if (vehicle.isEmergency) {
      color = vehicle.type === "fire-truck" ? "#ff4444" : vehicle.type === "ambulance" ? "#ff8844" : "#4488ff"
    }

    // Draw vehicle as small circle
    context.fillStyle = color
    context.beginPath()
    context.arc(screenX, screenY, 3, 0, Math.PI * 2)
    context.fill()

    // Draw heading indicator (small line showing direction)
    if (vehicle.velocity > 0) {
      const headingLength = 6
      const endX = screenX + Math.cos(vehicle.heading) * headingLength
      const endY = screenY + Math.sin(vehicle.heading) * headingLength

      context.strokeStyle = color
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(screenX, screenY)
      context.lineTo(endX, endY)
      context.stroke()
    }
  }
}

/**
 * Example 4: Rendering Road Network
 */
export function renderRoadNetwork(
  context: CanvasRenderingContext2D,
  trafficSystem: TrafficSystem,
  viewportBounds: ViewportBounds,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const graph = trafficSystem.getRoadGraph()
  const congestionMonitor = trafficSystem.getCongestionMonitor()

  // Draw road segments
  const segments = graph.getAllEdges()

  for (const segment of segments) {
    const fromNode = graph.getNode(segment.fromNodeId)
    const toNode = graph.getNode(segment.toNodeId)

    if (!fromNode || !toNode) continue

    // Convert to screen coordinates
    const x1 = ((fromNode.position.lng - viewportBounds.west) / (viewportBounds.east - viewportBounds.west)) * canvasWidth
    const y1 = ((viewportBounds.north - fromNode.position.lat) / (viewportBounds.north - viewportBounds.south)) * canvasHeight
    const x2 = ((toNode.position.lng - viewportBounds.west) / (viewportBounds.east - viewportBounds.west)) * canvasWidth
    const y2 = ((viewportBounds.north - toNode.position.lat) / (viewportBounds.north - viewportBounds.south)) * canvasHeight

    // Color by congestion level
    const density = graph.getSegmentDensity(segment.id)
    let color = "#cccccc"
    if (density > 0.85) color = "#ff0000" // Gridlock
    else if (density > 0.6) color = "#ffaa00" // Heavy
    else if (density > 0.3) color = "#ffff00" // Moderate
    else color = "#00ff00" // Clear

    context.strokeStyle = color
    context.lineWidth = segment.lanes * 1.5
    context.globalAlpha = 0.5
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()
    context.globalAlpha = 1.0
  }

  // Draw intersections
  const nodes = graph.getAllNodes()
  for (const node of nodes) {
    const x = ((node.position.lng - viewportBounds.west) / (viewportBounds.east - viewportBounds.west)) * canvasWidth
    const y = ((viewportBounds.north - node.position.lat) / (viewportBounds.north - viewportBounds.south)) * canvasHeight

    // Check for traffic light
    const light = trafficSystem.getTrafficLightManager().getTrafficLight(node.id)

    if (light) {
      // Draw traffic light indicator
      const lightColor = light.phase === "green" ? "#00ff00" : light.phase === "yellow" ? "#ffff00" : "#ff0000"
      context.fillStyle = lightColor
      context.beginPath()
      context.arc(x, y, 4, 0, Math.PI * 2)
      context.fill()
    } else {
      // Draw regular intersection
      context.fillStyle = "#666666"
      context.beginPath()
      context.arc(x, y, 2, 0, Math.PI * 2)
      context.fill()
    }
  }
}

/**
 * Example 5: Performance Monitoring
 */
export function monitorTrafficPerformance(trafficSystem: TrafficSystem, performanceOptimizer: PerformanceOptimizer): void {
  const stats = trafficSystem.getStats()
  const metrics = performanceOptimizer.getMetrics(stats.totalVehicles, stats.vehiclesInViewport, stats.gridStats.totalCells)

  console.log("=== Traffic Performance Report ===")
  console.log(`FPS: ${metrics.fps}`)
  console.log(`Update Time: ${metrics.updateTimeMs.toFixed(2)}ms`)
  console.log(`Total Vehicles: ${metrics.vehicleCount}`)
  console.log(`Vehicles Updated: ${metrics.vehiclesUpdatedPerFrame}`)
  console.log(`Memory: ${metrics.memoryUsageMb}MB`)
  console.log(`Grid Cells: ${metrics.gridCellsActive}`)
  console.log(`Average Speed: ${stats.averageSpeed.toFixed(5)}`)
  console.log(`Network Congestion: ${(stats.congestionLevel * 100).toFixed(1)}%`)
  console.log(`Update Throttle Level: ${performanceOptimizer.getUpdateThrottleLevel()}`)
}

/**
 * Example 6: Responding to Events
 */
export class TrafficEventHandler {
  private trafficSystem: TrafficSystem

  constructor(trafficSystem: TrafficSystem) {
    this.trafficSystem = trafficSystem
  }

  /**
   * Handle emergency call - spawn emergency vehicle and route to incident
   */
  handleEmergencyCall(emergencyType: "fire" | "ambulance" | "police", incidentLocation: LatLng): void {
    const typeMap: Record<string, VehicleType> = {
      fire: VehicleType.FIRE_TRUCK,
      ambulance: VehicleType.AMBULANCE,
      police: VehicleType.POLICE_CAR,
    }

    this.trafficSystem.spawnEmergencyVehicle(typeMap[emergencyType], incidentLocation)

    console.log(`[Emergency] ${emergencyType.toUpperCase()} dispatched to ${incidentLocation.lat}, ${incidentLocation.lng}`)
  }

  /**
   * Handle traffic incident - create congestion on affected segment
   */
  handleTrafficIncident(segmentId: string, severity: number, duration: number): void {
    const congestionMonitor = this.trafficSystem.getCongestionMonitor()

    congestionMonitor.addIncident({
      id: `incident_${Date.now()}`,
      segmentId,
      type: "accident",
      severity,
      createdAt: Date.now(),
      duration,
      affectedLanes: Math.ceil(severity * 3),
    })

    console.log(`[Incident] Accident on segment ${segmentId}, affecting ${Math.ceil(severity * 3)} lanes for ${duration}ms`)
  }

  /**
   * Handle viewport change
   */
  handleViewportChange(newBounds: ViewportBounds): void {
    this.trafficSystem.setViewportBounds(newBounds)
    console.log(`[Viewport] Updated to ${newBounds.north.toFixed(4)}, ${newBounds.south.toFixed(4)}, ${newBounds.east.toFixed(4)}, ${newBounds.west.toFixed(4)}`)
  }
}

/**
 * Example 7: Quick Start - Minimal Setup
 */
export function quickStartTraffic(): GameLoop {
  // Create game loop
  const gameLoop = new GameLoop()

  // Spawn initial traffic
  gameLoop.spawnTrafficVehicles(30)

  // Start simulation
  gameLoop.start()

  // Spawn an emergency vehicle every 30 seconds
  setInterval(() => {
    const destinations = [
      { lat: 59.915, lng: 10.755 },
      { lat: 59.915, lng: 10.750 },
      { lat: 59.910, lng: 10.755 },
    ]
    const dest = destinations[Math.floor(Math.random() * destinations.length)]

    const types = [VehicleType.FIRE_TRUCK, VehicleType.AMBULANCE, VehicleType.POLICE_CAR]
    const type = types[Math.floor(Math.random() * types.length)]

    gameLoop.spawnEmergencyVehicle(type, dest)
  }, 30000)

  return gameLoop
}
