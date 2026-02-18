/**
 * Vehicle Behavior Controller
 * Manages individual NPC vehicle states and behaviors
 */

import { LatLng } from "../pathfinding/road-graph"
import { Route } from "../pathfinding/pathfinder"
import { TrafficLightManager, TrafficLightDirection } from "./traffic-light-manager"

export enum VehicleState {
  IDLE = "idle",
  MOVING = "moving",
  TURNING = "turning",
  BRAKING = "braking",
  YIELDING = "yielding",
  EMERGENCY_MODE = "emergency-mode",
}

export enum VehicleType {
  REGULAR_CAR = "car",
  FIRE_TRUCK = "fire-truck",
  AMBULANCE = "ambulance",
  POLICE_CAR = "police-car",
}

/**
 * Represents an NPC vehicle on the road network
 */
export interface NPCVehicle {
  id: string
  type: VehicleType
  position: LatLng
  heading: number // in radians
  velocity: number // current speed
  maxSpeed: number // speed limit for this vehicle type
  acceleration: number
  length: number // vehicle length in lat/lng units
  route: Route | null
  routeProgress: number // index along route waypoints
  currentNodeId: string | null
  nextNodeId: string | null
  state: VehicleState
  desiredVelocity: number // target speed considering traffic
  
  // Emergency vehicle specific
  isEmergency: boolean
  sirenActive: boolean
  emergencyPriority: number // 0-1, how aggressive in traffic
  
  // Behavior parameters
  reactionTime: number // time to react to changes (ms)
  lastReactionTime: number
  aggressiveness: number // 0-1, affects following distance and lane changes
  
  // Collision avoidance
  followingDistance: number
  minFollowingDistance: number
  nearbyVehicles: string[] // IDs of vehicles nearby
  
  // Traffic state
  stoppedTicks: number
  isStuckCounter: number
}

/**
 * Traffic Rules Engine
 * Enforces traffic rules and provides behavior logic
 */
export class VehicleController {
  private vehicles: Map<string, NPCVehicle> = new Map()
  private trafficLightManager: TrafficLightManager
  private nextVehicleId: number = 0

  constructor(trafficLightManager: TrafficLightManager) {
    this.trafficLightManager = trafficLightManager
  }

  /**
   * Create a new NPC vehicle
   */
  createVehicle(
    position: LatLng,
    type: VehicleType = VehicleType.REGULAR_CAR,
    isEmergency: boolean = false,
  ): NPCVehicle {
    const vehicle: NPCVehicle = {
      id: `vehicle_${this.nextVehicleId++}`,
      type,
      position: { ...position },
      heading: 0,
      velocity: 0,
      maxSpeed: this.getMaxSpeed(type),
      acceleration: 0.00001,
      length: 0.0001, // approximately 10 meters
      route: null,
      routeProgress: 0,
      currentNodeId: null,
      nextNodeId: null,
      state: VehicleState.IDLE,
      desiredVelocity: 0,
      isEmergency,
      sirenActive: false,
      emergencyPriority: isEmergency ? 0.9 : 0,
      reactionTime: isEmergency ? 100 : 300,
      lastReactionTime: Date.now(),
      aggressiveness: Math.random() * 0.5 + 0.3, // 0.3-0.8
      followingDistance: 0.0002,
      minFollowingDistance: isEmergency ? 0.00005 : 0.0001,
      nearbyVehicles: [],
      stoppedTicks: 0,
      isStuckCounter: 0,
    }

    this.vehicles.set(vehicle.id, vehicle)
    return vehicle
  }

  /**
   * Get maximum speed for a vehicle type (in lat/lng units per second)
   */
  private getMaxSpeed(type: VehicleType): number {
    switch (type) {
      case VehicleType.FIRE_TRUCK:
        return 0.00008 // ~8.9 km/h relative to lat/lng
      case VehicleType.AMBULANCE:
        return 0.00009
      case VehicleType.POLICE_CAR:
        return 0.0001
      case VehicleType.REGULAR_CAR:
      default:
        return 0.00007
    }
  }

  /**
   * Update a vehicle's behavior based on traffic rules and environment
   */
  updateVehicle(vehicle: NPCVehicle, deltaTime: number, nearbyVehicles: NPCVehicle[]): void {
    // Update nearby vehicles list
    vehicle.nearbyVehicles = this.findNearbyVehicles(vehicle, nearbyVehicles)

    // Check reaction time
    const now = Date.now()
    if (now - vehicle.lastReactionTime > vehicle.reactionTime) {
      vehicle.lastReactionTime = now

      // Decide desired velocity based on conditions
      vehicle.desiredVelocity = this.calculateDesiredVelocity(vehicle, nearbyVehicles)

      // Update state machine
      this.updateVehicleState(vehicle)
    }

    // Apply smooth acceleration/braking
    this.updateVelocity(vehicle, deltaTime)

    // Move vehicle along route
    if (vehicle.route && vehicle.velocity > 0) {
      this.moveAlongRoute(vehicle, deltaTime)
    }

    // Update heading to match direction of travel
    this.updateHeading(vehicle)
  }

  /**
   * Calculate desired velocity based on traffic conditions
   */
  private calculateDesiredVelocity(vehicle: NPCVehicle, nearbyVehicles: NPCVehicle[]): number {
    let desiredSpeed = vehicle.maxSpeed

    // Emergency vehicles maintain high speed
    if (vehicle.isEmergency) {
      desiredSpeed = vehicle.maxSpeed * 1.2
    } else {
      // Check for vehicles ahead
      const vehicleAhead = this.getVehicleAhead(vehicle, nearbyVehicles)
      if (vehicleAhead) {
        // Reduce speed to maintain safe distance
        desiredSpeed = Math.min(desiredSpeed, vehicleAhead.velocity - 0.00002)

        // If vehicle ahead is stopped, we need to stop too
        if (vehicleAhead.velocity === 0) {
          desiredSpeed = 0
        }
      }

      // Check traffic light
      if (vehicle.nextNodeId) {
        const canProceed = this.trafficLightManager.canProceed(
          vehicle.nextNodeId,
          this.getDirectionToNode(vehicle),
        )

        if (!canProceed) {
          desiredSpeed = 0 // Stop at red light
        }
      }

      // Congestion-based slowdown
      if (vehicle.nearbyVehicles.length > 3) {
        const congestionFactor = Math.min(1, vehicle.nearbyVehicles.length / 10)
        desiredSpeed *= (1 - congestionFactor * 0.5)
      }
    }

    return Math.max(0, desiredSpeed)
  }

  /**
   * Find nearby vehicles within detection range
   */
  private findNearbyVehicles(vehicle: NPCVehicle, allVehicles: NPCVehicle[]): string[] {
    const detectionRange = 0.0005 // ~50 meters
    const nearby: string[] = []

    for (const other of allVehicles) {
      if (other.id === vehicle.id) continue

      const dist = this.distance(vehicle.position, other.position)
      if (dist < detectionRange) {
        nearby.push(other.id)
      }
    }

    return nearby
  }

  /**
   * Get vehicle directly ahead (same lane)
   */
  private getVehicleAhead(vehicle: NPCVehicle, nearbyVehicles: NPCVehicle[]): NPCVehicle | null {
    let closestAhead: NPCVehicle | null = null
    let closestDistance = Infinity

    for (const nearby of nearbyVehicles) {
      // Check if roughly in same direction
      const headingDiff = Math.abs(nearby.heading - vehicle.heading)
      if (headingDiff > Math.PI / 4) continue // Not in same direction

      const dist = this.distance(vehicle.position, nearby.position)
      if (dist < closestDistance && dist > 0) {
        closestDistance = dist
        closestAhead = nearby
      }
    }

    return closestDistance < 0.0003 ? closestAhead : null // ~30 meters
  }

  /**
   * Update vehicle state based on current conditions
   */
  private updateVehicleState(vehicle: NPCVehicle): void {
    if (vehicle.desiredVelocity === 0) {
      vehicle.state = vehicle.velocity > 0 ? VehicleState.BRAKING : VehicleState.YIELDING
      vehicle.stoppedTicks++
    } else if (vehicle.velocity > 0) {
      vehicle.state = VehicleState.MOVING
      vehicle.stoppedTicks = 0
    } else {
      vehicle.state = VehicleState.IDLE
      vehicle.stoppedTicks++
    }

    // Detect stuck vehicles
    if (vehicle.stoppedTicks > 300) {
      vehicle.isStuckCounter++
    } else {
      vehicle.isStuckCounter = 0
    }
  }

  /**
   * Smooth velocity changes
   */
  private updateVelocity(vehicle: NPCVehicle, deltaTime: number): void {
    const speedDiff = vehicle.desiredVelocity - vehicle.velocity
    const maxAccel = vehicle.acceleration * (speedDiff > 0 ? 1.5 : 2.0) // brake harder than accelerate

    const accelerationThisFrame = Math.max(-maxAccel * deltaTime, Math.min(maxAccel * deltaTime, speedDiff))
    vehicle.velocity += accelerationThisFrame

    vehicle.velocity = Math.max(0, Math.min(vehicle.maxSpeed, vehicle.velocity))
  }

  /**
   * Move vehicle along its route
   */
  private moveAlongRoute(vehicle: NPCVehicle, deltaTime: number): void {
    if (!vehicle.route || vehicle.route.waypoints.length === 0) return

    const distance = vehicle.velocity * deltaTime
    const currentWaypoint = vehicle.route.waypoints[vehicle.routeProgress]
    const nextWaypoint = vehicle.route.waypoints[vehicle.routeProgress + 1]

    if (!currentWaypoint || !nextWaypoint) {
      // Route complete
      vehicle.route = null
      vehicle.state = VehicleState.IDLE
      return
    }

    // Move towards next waypoint
    const wayDir = {
      lat: nextWaypoint.lat - vehicle.position.lat,
      lng: nextWaypoint.lng - vehicle.position.lng,
    }

    const wayDist = Math.sqrt(wayDir.lat * wayDir.lat + wayDir.lng * wayDir.lng)

    if (wayDist > 0) {
      const moveAmount = Math.min(distance, wayDist)
      const fraction = moveAmount / wayDist

      vehicle.position.lat += wayDir.lat * fraction
      vehicle.position.lng += wayDir.lng * fraction

      // Check if reached waypoint
      const distToNext = this.distance(vehicle.position, nextWaypoint)
      if (distToNext < 0.00005) {
        // Waypoint reached, move to next
        vehicle.routeProgress++

        if (vehicle.routeProgress >= vehicle.route.waypoints.length - 1) {
          vehicle.route = null
        }
      }
    }
  }

  /**
   * Update vehicle heading to match direction of travel
   */
  private updateHeading(vehicle: NPCVehicle): void {
    if (vehicle.velocity === 0) return

    if (vehicle.route && vehicle.routeProgress + 1 < vehicle.route.waypoints.length) {
      const current = vehicle.route.waypoints[vehicle.routeProgress]
      const next = vehicle.route.waypoints[vehicle.routeProgress + 1]

      const dir = {
        lat: next.lat - current.lat,
        lng: next.lng - current.lng,
      }

      const dist = Math.sqrt(dir.lat * dir.lat + dir.lng * dir.lng)
      if (dist > 0) {
        vehicle.heading = Math.atan2(dir.lng, dir.lat)
      }
    }
  }

  /**
   * Get direction to next node (N-S or E-W)
   */
  private getDirectionToNode(vehicle: NPCVehicle): TrafficLightDirection {
    if (vehicle.route && vehicle.routeProgress + 1 < vehicle.route.waypoints.length) {
      const current = vehicle.route.waypoints[vehicle.routeProgress]
      const next = vehicle.route.waypoints[vehicle.routeProgress + 1]

      // Simple heuristic: if lat changes more, it's N-S; if lng changes more, it's E-W
      const latDelta = Math.abs(next.lat - current.lat)
      const lngDelta = Math.abs(next.lng - current.lng)

      return latDelta > lngDelta ? TrafficLightDirection.NS : TrafficLightDirection.EW
    }

    return TrafficLightDirection.NS
  }

  /**
   * Calculate distance between two positions
   */
  private distance(p1: LatLng, p2: LatLng): number {
    const latDiff = p1.lat - p2.lat
    const lngDiff = p1.lng - p2.lng
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff)
  }

  /**
   * Get all vehicles
   */
  getAllVehicles(): NPCVehicle[] {
    return Array.from(this.vehicles.values())
  }

  /**
   * Get vehicle by ID
   */
  getVehicle(id: string): NPCVehicle | undefined {
    return this.vehicles.get(id)
  }

  /**
   * Remove vehicle
   */
  removeVehicle(id: string): void {
    this.vehicles.delete(id)
  }

  /**
   * Check if vehicle is stuck and needs rerouting
   */
  isVehicleStuck(vehicle: NPCVehicle): boolean {
    return vehicle.isStuckCounter > 5 // Stuck for more than 1.5 seconds
  }

  /**
   * Activate emergency mode for a vehicle
   */
  activateEmergency(vehicleId: string): void {
    const vehicle = this.vehicles.get(vehicleId)
    if (vehicle) {
      vehicle.isEmergency = true
      vehicle.sirenActive = true
      vehicle.maxSpeed *= 1.3
      vehicle.followingDistance = vehicle.minFollowingDistance
    }
  }

  /**
   * Deactivate emergency mode
   */
  deactivateEmergency(vehicleId: string): void {
    const vehicle = this.vehicles.get(vehicleId)
    if (vehicle) {
      vehicle.isEmergency = false
      vehicle.sirenActive = false
      vehicle.maxSpeed = this.getMaxSpeed(vehicle.type)
      vehicle.followingDistance = 0.0002
    }
  }
}
