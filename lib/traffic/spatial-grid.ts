/**
 * Spatial Grid for Viewport Optimization
 * Efficiently tracks which vehicles are visible and need updates
 */

import { LatLng } from "../pathfinding/road-graph"
import { NPCVehicle } from "./vehicle-controller"

/**
 * Viewport bounds
 */
export interface ViewportBounds {
  north: number
  south: number
  east: number
  west: number
}

/**
 * Spatial Grid Cell
 */
export interface GridCell {
  vehicles: string[] // vehicle IDs
}

/**
 * Spatial Grid for efficient spatial queries
 */
export class SpatialGrid {
  private cells: Map<string, GridCell> = new Map()
  private vehicleToCell: Map<string, string> = new Map() // vehicle ID -> cell key
  private cellSize: number = 0.001 // approximately 100m
  private viewportBounds: ViewportBounds
  private lookaheadMargin: number = 0.002 // margin beyond viewport

  constructor(viewportBounds: ViewportBounds) {
    this.viewportBounds = viewportBounds
  }

  /**
   * Add vehicle to grid
   */
  addVehicle(vehicle: NPCVehicle): void {
    const cellKey = this.getCellKey(vehicle.position)
    this.removeVehicle(vehicle.id) // Remove from old cell if exists

    if (!this.cells.has(cellKey)) {
      this.cells.set(cellKey, { vehicles: [] })
    }

    this.cells.get(cellKey)!.vehicles.push(vehicle.id)
    this.vehicleToCell.set(vehicle.id, cellKey)
  }

  /**
   * Remove vehicle from grid
   */
  removeVehicle(vehicleId: string): void {
    const cellKey = this.vehicleToCell.get(vehicleId)
    if (cellKey) {
      const cell = this.cells.get(cellKey)
      if (cell) {
        cell.vehicles = cell.vehicles.filter(id => id !== vehicleId)
        if (cell.vehicles.length === 0) {
          this.cells.delete(cellKey)
        }
      }
      this.vehicleToCell.delete(vehicleId)
    }
  }

  /**
   * Update vehicle position in grid
   */
  updateVehicle(vehicle: NPCVehicle): void {
    const currentCellKey = this.vehicleToCell.get(vehicle.id)
    const newCellKey = this.getCellKey(vehicle.position)

    // If vehicle moved to a different cell, update grid
    if (currentCellKey !== newCellKey) {
      this.addVehicle(vehicle)
    }
  }

  /**
   * Get all vehicles in viewport
   */
  getViewportVehicles(): string[] {
    const vehicles: string[] = []
    const expandedBounds = this.getExpandedBounds()

    const minCol = Math.floor(expandedBounds.west / this.cellSize)
    const maxCol = Math.ceil(expandedBounds.east / this.cellSize)
    const minRow = Math.floor(expandedBounds.south / this.cellSize)
    const maxRow = Math.ceil(expandedBounds.north / this.cellSize)

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const cellKey = `${row},${col}`
        const cell = this.cells.get(cellKey)
        if (cell) {
          vehicles.push(...cell.vehicles)
        }
      }
    }

    return vehicles
  }

  /**
   * Get vehicles near a position
   */
  getNearbyVehicles(position: LatLng, radius: number): string[] {
    const vehicles: string[] = []

    // Check cells within radius
    const cellRadius = Math.ceil(radius / this.cellSize)
    const [centerRow, centerCol] = this.positionToCell(position)

    for (let row = centerRow - cellRadius; row <= centerRow + cellRadius; row++) {
      for (let col = centerCol - cellRadius; col <= centerCol + cellRadius; col++) {
        const cellKey = `${row},${col}`
        const cell = this.cells.get(cellKey)
        if (cell) {
          vehicles.push(...cell.vehicles)
        }
      }
    }

    return vehicles
  }

  /**
   * Check if position is in viewport
   */
  isInViewport(position: LatLng): boolean {
    return (
      position.lat >= this.viewportBounds.south &&
      position.lat <= this.viewportBounds.north &&
      position.lng >= this.viewportBounds.west &&
      position.lng <= this.viewportBounds.east
    )
  }

  /**
   * Check if position is in expanded viewport (with lookahead)
   */
  isInExpandedViewport(position: LatLng): boolean {
    const expanded = this.getExpandedBounds()
    return (
      position.lat >= expanded.south &&
      position.lat <= expanded.north &&
      position.lng >= expanded.west &&
      position.lng <= expanded.east
    )
  }

  /**
   * Update viewport bounds
   */
  updateViewportBounds(bounds: ViewportBounds): void {
    this.viewportBounds = bounds
  }

  /**
   * Get expanded bounds for lookahead updates
   */
  private getExpandedBounds(): ViewportBounds {
    return {
      north: this.viewportBounds.north + this.lookaheadMargin,
      south: this.viewportBounds.south - this.lookaheadMargin,
      east: this.viewportBounds.east + this.lookaheadMargin,
      west: this.viewportBounds.west - this.lookaheadMargin,
    }
  }

  /**
   * Get cell key for a position
   */
  private getCellKey(position: LatLng): string {
    const [row, col] = this.positionToCell(position)
    return `${row},${col}`
  }

  /**
   * Convert position to grid cell coordinates
   */
  private positionToCell(position: LatLng): [number, number] {
    const row = Math.floor(position.lat / this.cellSize)
    const col = Math.floor(position.lng / this.cellSize)
    return [row, col]
  }

  /**
   * Clear all vehicles from grid
   */
  clear(): void {
    this.cells.clear()
    this.vehicleToCell.clear()
  }

  /**
   * Get grid stats for debugging
   */
  getStats(): {
    totalCells: number
    totalVehicles: number
    avgVehiclesPerCell: number
  } {
    const totalVehicles = this.vehicleToCell.size
    const totalCells = this.cells.size
    const avgPerCell = totalCells > 0 ? totalVehicles / totalCells : 0

    return { totalCells, totalVehicles, avgVehiclesPerCell: avgPerCell }
  }
}

/**
 * NPC Spawner with Viewport Awareness
 */
export class NPCSpawner {
  private viewportBounds: ViewportBounds
  private spawnQueue: Array<{
    position: LatLng
    destination: LatLng
    type: string
  }> = []
  private maxSpawned: number = 50
  private spawnRadius: number = 0.002 // margin around viewport

  constructor(viewportBounds: ViewportBounds, maxSpawned: number = 50) {
    this.viewportBounds = viewportBounds
    this.maxSpawned = maxSpawned
  }

  /**
   * Queue a vehicle for spawning
   */
  queueVehicle(position: LatLng, destination: LatLng, type: string = "car"): void {
    this.spawnQueue.push({ position, destination, type })
  }

  /**
   * Get vehicles to spawn this frame
   */
  getVehiclesToSpawn(currentVehicleCount: number): Array<{
    position: LatLng
    destination: LatLng
    type: string
  }> {
    const toSpawn: Array<{
      position: LatLng
      destination: LatLng
      type: string
    }> = []

    // Prioritize spawning vehicles in viewport
    const canSpawn = this.maxSpawned - currentVehicleCount

    while (this.spawnQueue.length > 0 && toSpawn.length < canSpawn) {
      const vehicle = this.spawnQueue.shift()!

      // Only spawn if in or near viewport
      if (this.isSpawnable(vehicle.position)) {
        toSpawn.push(vehicle)
      } else {
        // Put back in queue if not ready to spawn
        this.spawnQueue.unshift(vehicle)
        break
      }
    }

    return toSpawn
  }

  /**
   * Check if position is spawnable (in viewport or near margin)
   */
  private isSpawnable(position: LatLng): boolean {
    return (
      position.lat >= this.viewportBounds.south - this.spawnRadius &&
      position.lat <= this.viewportBounds.north + this.spawnRadius &&
      position.lng >= this.viewportBounds.west - this.spawnRadius &&
      position.lng <= this.viewportBounds.east + this.spawnRadius
    )
  }

  /**
   * Update viewport bounds
   */
  updateViewportBounds(bounds: ViewportBounds): void {
    this.viewportBounds = bounds
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.spawnQueue.length
  }
}
