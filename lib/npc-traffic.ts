/**
 * Simple NPC Vehicle System - Spawns autonomous vehicles for ambient traffic
 */

import type { LatLng } from "./game-types"
import { streetAwareRoute, snapToNearestRoad } from "./road-network"

export interface NPCVehicle {
  id: string
  position: LatLng
  destination: LatLng
  route: LatLng[]
  routeIndex: number
  speed: number // units per tick
  color: string
  spawned: number // timestamp
}

class NPCTrafficManager {
  private vehicles: Map<string, NPCVehicle> = new Map()
  private spawners: Array<{ position: LatLng; frequency: number; lastSpawn: number }> = []
  private nextId = 0
  private maxVehicles = 8
  private viewportBounds: { north: number; south: number; east: number; west: number } | null = null

  constructor() {
    // Define spawn points around the city
    this.spawners = [
      { position: { lat: 59.31, lng: 18.05 }, frequency: 3000, lastSpawn: 0 },
      { position: { lat: 59.34, lng: 18.07 }, frequency: 3500, lastSpawn: 0 },
      { position: { lat: 59.33, lng: 18.1 }, frequency: 4000, lastSpawn: 0 },
      { position: { lat: 59.32, lng: 18.08 }, frequency: 3200, lastSpawn: 0 },
    ]
  }

  updateViewportBounds(bounds: { north: number; south: number; east: number; west: number }) {
    this.viewportBounds = bounds
  }

  update(deltaTime: number) {
    const now = Date.now()

    // Spawn new vehicles
    for (const spawner of this.spawners) {
      if (this.vehicles.size < this.maxVehicles && now - spawner.lastSpawn > spawner.frequency) {
        this.spawnVehicle(spawner.position)
        spawner.lastSpawn = now
      }
    }

    // Update existing vehicles
    const toRemove: string[] = []
    for (const [id, vehicle] of this.vehicles) {
      // Move vehicle along route
      vehicle.speed = 0.0002 // ~0.0002 per tick at normal speed
      vehicle.routeIndex += vehicle.speed * (1 + Math.random() * 0.1) // slight variation

      if (vehicle.routeIndex >= vehicle.route.length - 1) {
        // Reached destination, pick new one
        this.reassignVehicle(id)
      } else {
        // Interpolate position along route
        const idx = Math.floor(vehicle.routeIndex)
        const nextIdx = Math.min(idx + 1, vehicle.route.length - 1)
        const t = vehicle.routeIndex - idx

        const p1 = vehicle.route[idx]
        const p2 = vehicle.route[nextIdx]

        vehicle.position = {
          lat: p1.lat + t * (p2.lat - p1.lat),
          lng: p1.lng + t * (p2.lng - p1.lng),
        }
      }

      // Remove if out of viewport and old enough
      if (!this.isInViewport(vehicle.position) && now - vehicle.spawned > 30000) {
        toRemove.push(id)
      }
    }

    // Clean up removed vehicles
    for (const id of toRemove) {
      this.vehicles.delete(id)
    }
  }

  private isInViewport(pos: LatLng): boolean {
    if (!this.viewportBounds) return true
    const b = this.viewportBounds
    return pos.lat <= b.north && pos.lat >= b.south && pos.lng <= b.east && pos.lng >= b.west
  }

  private spawnVehicle(position: LatLng) {
    // Snap to nearest road
    const snappedPos = snapToNearestRoad(position, 0.01)

    // Pick random destination
    const destinations = [
      { lat: 59.33, lng: 18.06 },
      { lat: 59.32, lng: 18.08 },
      { lat: 59.34, lng: 18.095 },
      { lat: 59.315, lng: 18.07 },
    ]
    const destination = destinations[Math.floor(Math.random() * destinations.length)]

    const route = streetAwareRoute(snappedPos, destination)
    const vehicle: NPCVehicle = {
      id: `npc-${this.nextId++}`,
      position: snappedPos,
      destination,
      route,
      routeIndex: 0,
      speed: 0.0002,
      color: "#666666",
      spawned: Date.now(),
    }

    this.vehicles.set(vehicle.id, vehicle)
  }

  private reassignVehicle(id: string) {
    const vehicle = this.vehicles.get(id)
    if (!vehicle) return

    // Pick new destination
    const destinations = [
      { lat: 59.33, lng: 18.06 },
      { lat: 59.32, lng: 18.08 },
      { lat: 59.34, lng: 18.095 },
      { lat: 59.315, lng: 18.07 },
    ]
    const destination = destinations[Math.floor(Math.random() * destinations.length)]

    vehicle.destination = destination
    vehicle.route = streetAwareRoute(vehicle.position, destination)
    vehicle.routeIndex = 0
  }

  getVehicles(): NPCVehicle[] {
    return Array.from(this.vehicles.values())
  }

  getVehiclesInViewport(): NPCVehicle[] {
    if (!this.viewportBounds) return this.getVehicles()
    return this.getVehicles().filter((v) => this.isInViewport(v.position))
  }
}

// Global instance
const npcTrafficManager = new NPCTrafficManager()

export function updateNPCTraffic(deltaTime: number) {
  npcTrafficManager.update(deltaTime)
}

export function updateNPCViewportBounds(bounds: { north: number; south: number; east: number; west: number }) {
  npcTrafficManager.updateViewportBounds(bounds)
}

export function getNPCVehicles(): NPCVehicle[] {
  return npcTrafficManager.getVehicles()
}

export function getNPCVehiclesInViewport(): NPCVehicle[] {
  return npcTrafficManager.getVehiclesInViewport()
}
