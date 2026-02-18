/**
 * Master Traffic Management System
 * Orchestrates all traffic simulation components
 * - Road network and pathfinding
 * - Vehicle behavior and traffic rules
 * - Traffic lights with emergency priority
 * - Spatial grid and viewport optimization
 * - Performance monitoring
 */

import { RoadGraph, createSampleRoadNetwork, LatLng } from "../pathfinding/road-graph"
import { Pathfinder, Route } from "../pathfinding/pathfinder"
import { TrafficLightManager, TrafficLightDirection, createCoordinatedLights } from "./traffic-light-manager"
import { VehicleController, NPCVehicle, VehicleType } from "./vehicle-controller"
import { SpatialGrid, NPCSpawner, ViewportBounds } from "./spatial-grid"
import { CongestionMonitor, ReroutingEngine, AdaptiveTrafficFlow } from "./congestion-system"

export interface TrafficSystemConfig {
  maxVehicles: number
  gridSize: number
  timeScale: number
  enableEmergencies: boolean
  enableTrafficLights: boolean
}

export interface TrafficSystemStats {
  totalVehicles: number
  vehiclesInViewport: number
  averageSpeed: number
  congestionLevel: number
  updateTimeMs: number
  gridStats: {
    totalCells: number
    totalVehicles: number
    avgVehiclesPerCell: number
  }
}

/**
 * Master Traffic System
 */
export class TrafficSystem {
  private roadGraph: RoadGraph
  private pathfinder: Pathfinder
  private vehicleController: VehicleController
  private trafficLightManager: TrafficLightManager
  private spatialGrid: SpatialGrid
  private spawner: NPCSpawner
  private congestionMonitor: CongestionMonitor
  private reroutingEngine: ReroutingEngine
  private adaptiveFlow: AdaptiveTrafficFlow
  private config: TrafficSystemConfig
  private lastUpdateTime: number = Date.now()
  private stats: TrafficSystemStats = {
    totalVehicles: 0,
    vehiclesInViewport: 0,
    averageSpeed: 0,
    congestionLevel: 0,
    updateTimeMs: 0,
    gridStats: { totalCells: 0, totalVehicles: 0, avgVehiclesPerCell: 0 },
  }

  // Update scheduling
  private updateQueues: Map<string, number> = new Map() // vehicle ID -> next update frame
  private currentFrame: number = 0

  // Emergency vehicle tracking
  private activeEmergencies: Set<string> = new Set()
  private emergencyPathfinder: Pathfinder | null = null

  constructor(
    viewportBounds: ViewportBounds,
    config: Partial<TrafficSystemConfig> = {},
  ) {
    this.config = {
      maxVehicles: 50,
      gridSize: 5,
      timeScale: 1.0,
      enableEmergencies: true,
      enableTrafficLights: true,
      ...config,
    }

    // Initialize core systems
    this.roadGraph = createSampleRoadNetwork()
    this.pathfinder = new Pathfinder(this.roadGraph)
    this.emergencyPathfinder = new Pathfinder(this.roadGraph)
    this.vehicleController = new VehicleController(new TrafficLightManager())
    this.trafficLightManager = new TrafficLightManager()

    // Initialize traffic lights
    if (this.config.enableTrafficLights) {
      const intersections = this.roadGraph.getAllNodes()
      createCoordinatedLights(intersections, this.config.gridSize)

      for (const node of intersections) {
        this.trafficLightManager.createTrafficLight(node.id, node.type)
      }
    }

    // Initialize spatial systems
    this.spatialGrid = new SpatialGrid(viewportBounds)
    this.spawner = new NPCSpawner(viewportBounds, this.config.maxVehicles)

    // Initialize congestion and rerouting systems
    this.congestionMonitor = new CongestionMonitor(this.roadGraph)
    this.reroutingEngine = new ReroutingEngine(this.roadGraph, this.congestionMonitor)
    this.adaptiveFlow = new AdaptiveTrafficFlow(this.congestionMonitor)

    this.trafficLightManager.setTimeScale(this.config.timeScale)
  }

  /**
   * Update entire traffic system
   */
  update(deltaTime: number): void {
    const startTime = performance.now()
    this.currentFrame++

    // Update traffic lights
    if (this.config.enableTrafficLights) {
      this.trafficLightManager.updateAllLights()
    }

    // Update segment occupancy and congestion
    this.congestionMonitor.updateCongestion(this.vehicleController.getAllVehicles())

    // Update vehicles with smart scheduling
    const vehiclesToUpdate = this.vehicleController.getAllVehicles()
    const viewportVehicles = this.spatialGrid.getViewportVehicles()

    for (const vehicle of vehiclesToUpdate) {
      // Priority updates: emergencies and vehicles in viewport every frame
      const shouldUpdate =
        this.activeEmergencies.has(vehicle.id) ||
        viewportVehicles.includes(vehicle.id) ||
        this.isTimeToUpdate(vehicle.id)

      if (shouldUpdate) {
        const nearbyVehicles = this.getNearbyVehicles(vehicle)
        this.vehicleController.updateVehicle(vehicle, deltaTime, nearbyVehicles)
        this.spatialGrid.updateVehicle(vehicle)

        // Check for stuck vehicles and reroute
        if (this.vehicleController.isVehicleStuck(vehicle)) {
          this.rerouteVehicle(vehicle)
        }

        // Dynamic rerouting based on congestion
        if (this.reroutingEngine.shouldReroute(vehicle)) {
          const altRoute = this.reroutingEngine.calculateAlternativeRoute(
            vehicle,
            vehicle.route!,
            vehicle.isEmergency,
          )
          if (altRoute) {
            vehicle.route = altRoute
            vehicle.routeProgress = 0
          }
        }
      }
    }

    // Spawn new vehicles if room available
    this.spawnNewVehicles()

    // Clean up off-screen vehicles
    this.cleanupOffscreenVehicles()

    // Update emergency states
    this.updateEmergencies()

    // Update adaptive traffic flow
    if (this.adaptiveFlow.isTimeToAdapt()) {
      this.adaptiveFlow.analyzeFlow()
      this.adaptiveFlow.markAdapted()
    }

    // Calculate stats
    this.updateStats(performance.now() - startTime)
  }

  /**
   * Set viewport bounds and update all spatial systems
   */
  setViewportBounds(bounds: ViewportBounds): void {
    this.spatialGrid.updateViewportBounds(bounds)
    this.spawner.updateViewportBounds(bounds)
  }

  /**
   * Spawn a vehicle with automatic routing
   */
  spawnVehicle(
    position: LatLng,
    destination: LatLng,
    type: VehicleType = VehicleType.REGULAR_CAR,
    isEmergency: boolean = false,
  ): NPCVehicle {
    const vehicle = this.vehicleController.createVehicle(position, type, isEmergency)

    // Calculate route
    const route = this.pathfinder.findPath(position, destination, isEmergency)
    if (route) {
      vehicle.route = route
      vehicle.routeProgress = 0
    }

    // Add to spatial grid
    this.spatialGrid.addVehicle(vehicle)

    // Register for updates
    this.updateQueues.set(vehicle.id, this.currentFrame)

    return vehicle
  }

  /**
   * Spawn emergency vehicle with priority
   */
  spawnEmergencyVehicle(position: LatLng, destination: LatLng, type: VehicleType): NPCVehicle {
    const vehicle = this.spawnVehicle(position, destination, type, true)
    this.activeEmergencies.add(vehicle.id)

    // Signal traffic lights of emergency approach
    this.signalEmergencyApproach(vehicle)

    return vehicle
  }

  /**
   * Signal traffic lights that emergency vehicle is approaching
   */
  private signalEmergencyApproach(vehicle: NPCVehicle): void {
    if (!vehicle.route || vehicle.route.nodeIds.length === 0) return

    // Signal the next intersection
    const nextNodeId = vehicle.route.nodeIds[Math.min(1, vehicle.route.nodeIds.length - 1)]
    const direction = this.getDirection(vehicle)

    this.trafficLightManager.signalEmergency(nextNodeId, direction)
  }

  /**
   * Get direction from vehicle position (N-S or E-W)
   */
  private getDirection(vehicle: NPCVehicle): TrafficLightDirection {
    if (vehicle.route && vehicle.routeProgress + 1 < vehicle.route.waypoints.length) {
      const current = vehicle.route.waypoints[vehicle.routeProgress]
      const next = vehicle.route.waypoints[vehicle.routeProgress + 1]

      const latDelta = Math.abs(next.lat - current.lat)
      const lngDelta = Math.abs(next.lng - current.lng)

      return latDelta > lngDelta ? TrafficLightDirection.NS : TrafficLightDirection.EW
    }

    return TrafficLightDirection.NS
  }

  /**
   * Reroute a stuck vehicle
   */
  private rerouteVehicle(vehicle: NPCVehicle): void {
    const altRoute = this.reroutingEngine.handleStuckVehicle(vehicle)
    if (altRoute) {
      vehicle.route = altRoute
      vehicle.routeProgress = 0
    }
  }

  /**
   * Get nearby vehicles for interaction
   */
  private getNearbyVehicles(vehicle: NPCVehicle): NPCVehicle[] {
    const nearbyIds = this.spatialGrid.getNearbyVehicles(vehicle.position, 0.0005)
    return nearbyIds
      .map(id => this.vehicleController.getVehicle(id))
      .filter((v): v is NPCVehicle => v !== undefined)
  }

  /**
   * Spawn new vehicles based on spawner queue
   */
  private spawnNewVehicles(): void {
    const allVehicles = this.vehicleController.getAllVehicles()
    const toSpawn = this.spawner.getVehiclesToSpawn(allVehicles.length)

    for (const spawnData of toSpawn) {
      const type = this.stringToVehicleType(spawnData.type)
      this.spawnVehicle(spawnData.position, spawnData.destination, type)
    }
  }

  /**
   * Convert string to VehicleType
   */
  private stringToVehicleType(type: string): VehicleType {
    switch (type.toLowerCase()) {
      case "fire-truck":
        return VehicleType.FIRE_TRUCK
      case "ambulance":
        return VehicleType.AMBULANCE
      case "police-car":
        return VehicleType.POLICE_CAR
      default:
        return VehicleType.REGULAR_CAR
    }
  }

  /**
   * Remove vehicles that are far off-screen
   */
  private cleanupOffscreenVehicles(): void {
    const allVehicles = this.vehicleController.getAllVehicles()

    for (const vehicle of allVehicles) {
      if (!this.spatialGrid.isInExpandedViewport(vehicle.position)) {
        // Check if vehicle reached destination or is stuck far away
        if (!vehicle.route || vehicle.isStuckCounter > 10) {
          this.spatialGrid.removeVehicle(vehicle.id)
          this.vehicleController.removeVehicle(vehicle.id)
          this.activeEmergencies.delete(vehicle.id)
          this.updateQueues.delete(vehicle.id)
        }
      }
    }
  }

  /**
   * Update emergency vehicle states
   */
  private updateEmergencies(): void {
    const allVehicles = this.vehicleController.getAllVehicles()

    for (const vehicleId of this.activeEmergencies) {
      const vehicle = this.vehicleController.getVehicle(vehicleId)

      if (vehicle && !vehicle.route) {
        // Emergency reached destination
        this.vehicleController.deactivateEmergency(vehicleId)
        this.activeEmergencies.delete(vehicleId)
        this.trafficLightManager.clearEmergency(vehicle.currentNodeId || "")
      } else if (vehicle) {
        // Keep signaling traffic lights
        this.signalEmergencyApproach(vehicle)
      }
    }
  }

  /**
   * Update segment occupancy for traffic-aware pathfinding
   */
  private updateSegmentOccupancy(): void {
    // This is now handled by congestionMonitor.updateCongestion()
  }

  /**
   * Check if it's time to update a vehicle
   * Implements smart scheduling: critical vehicles every frame, others every N frames
   */
  private isTimeToUpdate(vehicleId: string): boolean {
    const lastUpdate = this.updateQueues.get(vehicleId) || 0
    const updateInterval = this.activeEmergencies.has(vehicleId) ? 1 : 3 // emergencies: every frame, others: every 3 frames

    if (this.currentFrame - lastUpdate >= updateInterval) {
      this.updateQueues.set(vehicleId, this.currentFrame)
      return true
    }

    return false
  }

  /**
   * Calculate stats
   */
  private updateStats(updateTimeMs: number): void {
    const allVehicles = this.vehicleController.getAllVehicles()
    const viewportVehicles = this.spatialGrid.getViewportVehicles()

    let totalSpeed = 0
    let congestionCount = 0

    for (const vehicle of allVehicles) {
      totalSpeed += vehicle.velocity
      if (vehicle.velocity === 0 && vehicle.state !== "idle") {
        congestionCount++
      }
    }

    this.stats = {
      totalVehicles: allVehicles.length,
      vehiclesInViewport: viewportVehicles.length,
      averageSpeed: allVehicles.length > 0 ? totalSpeed / allVehicles.length : 0,
      congestionLevel: this.congestionMonitor.getNetworkCongestion(),
      updateTimeMs,
      gridStats: this.spatialGrid.getStats(),
    }
  }

  /**
   * Get traffic system statistics
   */
  getStats(): TrafficSystemStats {
    return this.stats
  }

  /**
   * Get all vehicles
   */
  getVehicles(): NPCVehicle[] {
    return this.vehicleController.getAllVehicles()
  }

  /**
   * Get vehicles in viewport
   */
  getViewportVehicles(): NPCVehicle[] {
    const viewportIds = this.spatialGrid.getViewportVehicles()
    return viewportIds
      .map(id => this.vehicleController.getVehicle(id))
      .filter((v): v is NPCVehicle => v !== undefined)
  }

  /**
   * Get road graph for rendering
   */
  getRoadGraph(): RoadGraph {
    return this.roadGraph
  }

  /**
   * Get traffic light manager for queries
   */
  getTrafficLightManager(): TrafficLightManager {
    return this.trafficLightManager
  }

  /**
   * Get congestion monitor
   */
  getCongestionMonitor(): CongestionMonitor {
    return this.congestionMonitor
  }

  /**
   * Queue vehicle for spawning
   */
  queueVehicleSpawn(position: LatLng, destination: LatLng, type: string = "car"): void {
    this.spawner.queueVehicle(position, destination, type)
  }

  /**
   * Set game time scale
   */
  setTimeScale(scale: number): void {
    this.config.timeScale = scale
    this.trafficLightManager.setTimeScale(scale)
  }

  /**
   * Update viewport bounds for spatial grid
   */
  updateViewportBounds(bounds: {
    north: number
    south: number
    east: number
    west: number
  }): void {
    this.spatialGrid.updateViewportBounds(bounds)
    this.spawner.updateViewportBounds(bounds)
  }
}
