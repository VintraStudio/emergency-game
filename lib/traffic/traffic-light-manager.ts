/**
 * Traffic Light Manager
 * Manages traffic light states at intersections with synchronized timing
 */

import { RoadNode, IntersectionType } from "./road-graph"

export enum TrafficLightPhase {
  RED = "red",
  YELLOW = "yellow",
  GREEN = "green",
}

export enum TrafficLightDirection {
  NS = "ns", // North-South
  EW = "ew", // East-West
}

/**
 * State of a traffic light at an intersection
 */
export interface TrafficLight {
  id: string
  intersectionId: string
  phase: TrafficLightPhase
  direction: TrafficLightDirection // which direction is green
  cycleTime: number // total cycle time in ms
  elapsedTime: number // time elapsed in current cycle
  greenDuration: number // how long green lasts
  yellowDuration: number // how long yellow lasts
  redDuration: number // how long red lasts
  offset: number // phase offset for coordination with adjacent lights
  emergencyOverride: boolean // emergency vehicle approaching
  emergencyDirection?: TrafficLightDirection // direction emergency is coming from
}

/**
 * Traffic Light Manager
 * Handles all intersection traffic lights with coordinated timing
 */
export class TrafficLightManager {
  private lights: Map<string, TrafficLight> = new Map()
  private intersectionToLight: Map<string, string> = new Map() // intersection ID -> light ID
  private lastUpdateTime: number = Date.now()
  private timeScale: number = 1.0 // for time acceleration in game

  /**
   * Create a traffic light for an intersection
   */
  createTrafficLight(intersectionId: string, nodeType: IntersectionType): TrafficLight | null {
    // Only traffic light intersections get lights
    if (nodeType !== IntersectionType.TRAFFIC_LIGHT) {
      return null
    }

    const lightId = `light_${intersectionId}`

    const light: TrafficLight = {
      id: lightId,
      intersectionId,
      phase: TrafficLightPhase.RED,
      direction: TrafficLightDirection.NS,
      cycleTime: 60000, // 60 second total cycle (real time)
      elapsedTime: 0,
      greenDuration: 25000, // 25 seconds green
      yellowDuration: 3000, // 3 seconds yellow
      redDuration: 32000, // 32 seconds red
      offset: Math.random() * 10000, // random offset for coordination
      emergencyOverride: false,
    }

    this.lights.set(lightId, light)
    this.intersectionToLight.set(intersectionId, lightId)

    return light
  }

  /**
   * Get traffic light for an intersection
   */
  getTrafficLight(intersectionId: string): TrafficLight | undefined {
    const lightId = this.intersectionToLight.get(intersectionId)
    return lightId ? this.lights.get(lightId) : undefined
  }

  /**
   * Update all traffic lights
   */
  updateAllLights(): void {
    const now = Date.now()
    const deltaTime = (now - this.lastUpdateTime) * this.timeScale
    this.lastUpdateTime = now

    for (const light of this.lights.values()) {
      this.updateLight(light, deltaTime)
    }
  }

  /**
   * Update a single traffic light
   */
  private updateLight(light: TrafficLight, deltaTime: number): void {
    light.elapsedTime += deltaTime

    // Check if cycle is complete
    if (light.elapsedTime >= light.cycleTime) {
      light.elapsedTime = 0
      light.emergencyOverride = false
    }

    // Determine phase based on elapsed time and offsets
    const cycleProgress = (light.elapsedTime + light.offset) % light.cycleTime

    // First half of cycle: NS is green
    if (cycleProgress < light.cycleTime / 2) {
      light.direction = TrafficLightDirection.NS

      const nsProgress = cycleProgress
      if (nsProgress < light.greenDuration) {
        light.phase = TrafficLightPhase.GREEN
      } else if (nsProgress < light.greenDuration + light.yellowDuration) {
        light.phase = TrafficLightPhase.YELLOW
      } else {
        light.phase = TrafficLightPhase.RED
      }
    } else {
      // Second half: EW is green
      light.direction = TrafficLightDirection.EW

      const ewProgress = cycleProgress - light.cycleTime / 2
      if (ewProgress < light.greenDuration) {
        light.phase = TrafficLightPhase.GREEN
      } else if (ewProgress < light.greenDuration + light.yellowDuration) {
        light.phase = TrafficLightPhase.YELLOW
      } else {
        light.phase = TrafficLightPhase.RED
      }
    }
  }

  /**
   * Signal emergency vehicle approaching from a direction
   * Triggers early phase change if needed
   */
  signalEmergency(intersectionId: string, direction: TrafficLightDirection): void {
    const light = this.getTrafficLight(intersectionId)
    if (!light) return

    light.emergencyOverride = true
    light.emergencyDirection = direction

    // If emergency is coming from a direction that's currently red, flip cycle
    if (light.direction !== direction) {
      // Reset elapsed time to trigger phase change
      light.elapsedTime = light.cycleTime / 2 - light.elapsedTime
    }
  }

  /**
   * Clear emergency override
   */
  clearEmergency(intersectionId: string): void {
    const light = this.getTrafficLight(intersectionId)
    if (light) {
      light.emergencyOverride = false
    }
  }

  /**
   * Get all traffic lights
   */
  getAllLights(): TrafficLight[] {
    return Array.from(this.lights.values())
  }

  /**
   * Set time scale for accelerated/decelerated time
   */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.1, Math.min(10, scale)) // Clamp between 0.1x and 10x
  }

  /**
   * Get light state as a simple status
   * Returns true if vehicle can proceed in the given direction
   */
  canProceed(intersectionId: string, direction: TrafficLightDirection): boolean {
    const light = this.getTrafficLight(intersectionId)
    if (!light) return true // If no light, allow passage

    // Can proceed if green in your direction
    if (light.phase === TrafficLightPhase.GREEN && light.direction === direction) {
      return true
    }

    // Can proceed on yellow (with caution) in your direction
    if (light.phase === TrafficLightPhase.YELLOW && light.direction === direction) {
      return true
    }

    return false
  }

  /**
   * Get distance to next light phase change (in simulation time)
   */
  getTimeToPhaseChange(intersectionId: string): number {
    const light = this.getTrafficLight(intersectionId)
    if (!light) return 0

    const timeToNextPhase = light.cycleTime - light.elapsedTime

    return timeToNextPhase / this.timeScale
  }

  /**
   * Get next green phase time for a given direction
   */
  getTimeToGreen(intersectionId: string, direction: TrafficLightDirection): number {
    const light = this.getTrafficLight(intersectionId)
    if (!light) return 0

    // If already green, return 0
    if (light.direction === direction && light.phase === TrafficLightPhase.GREEN) {
      return 0
    }

    // Calculate time until direction gets green
    const cycleProgress = (light.elapsedTime + light.offset) % light.cycleTime
    const halfCycle = light.cycleTime / 2

    if (light.direction === direction) {
      // We're already in the right half-cycle, just need to wait for red
      return (light.cycleTime - light.elapsedTime) / this.timeScale
    } else {
      // We're in the wrong half-cycle
      return (halfCycle - cycleProgress) / this.timeScale
    }
  }
}

/**
 * Build coordinated traffic lights for a grid network
 */
export function createCoordinatedLights(
  intersections: RoadNode[],
  gridWidth: number,
): TrafficLightManager {
  const manager = new TrafficLightManager()

  // Create traffic lights with coordinated offsets
  // Use a simple grid offset pattern: each light is offset by ~1/4 cycle
  intersections.forEach((intersection, index) => {
    if (intersection.type === IntersectionType.TRAFFIC_LIGHT) {
      const light = manager.createTrafficLight(intersection.id, intersection.type)
      if (light) {
        // Offset based on position in grid for smooth coordination
        const offsetPhase = (index % gridWidth) * 0.25 * light.cycleTime
        light.offset = offsetPhase
      }
    }
  })

  return manager
}
