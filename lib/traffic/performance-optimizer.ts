/**
 * Performance Optimization and Monitoring
 * Handles update scheduling, culling, and performance tracking
 */

export interface PerformanceMetrics {
  fps: number
  updateTimeMs: number
  renderTimeMs: number
  memoryUsageMb: number
  vehicleCount: number
  vehiclesUpdatedPerFrame: number
  gridCellsActive: number
}

/**
 * Performance Monitor and Optimizer
 */
export class PerformanceOptimizer {
  private frameTimings: number[] = []
  private maxFrameHistory: number = 60
  private targetFPS: number = 60
  private lastFrameTime: number = Date.now()
  private totalFramesProcessed: number = 0
  private updateThrottleLevel: number = 1 // 1 = all vehicles, 2 = every other, 3 = every third

  // Adaptive update scheduling
  private autoAdapt: boolean = true
  private lowPerformanceThreshold: number = 45 // FPS below this triggers optimization
  private highPerformanceThreshold: number = 55 // FPS above this allows more updates

  /**
   * Record frame timing
   */
  recordFrameTime(deltaTimeMs: number): void {
    this.frameTimings.push(deltaTimeMs)

    if (this.frameTimings.length > this.maxFrameHistory) {
      this.frameTimings.shift()
    }

    this.lastFrameTime = Date.now()
    this.totalFramesProcessed++

    // Auto-adapt update scheduling based on performance
    if (this.autoAdapt) {
      this.adaptUpdateSchedule()
    }
  }

  /**
   * Adapt update scheduling based on FPS
   */
  private adaptUpdateSchedule(): void {
    const currentFPS = this.getCurrentFPS()

    if (currentFPS < this.lowPerformanceThreshold && this.updateThrottleLevel < 3) {
      // Performance degrading, increase throttling
      this.updateThrottleLevel++
      console.log(`[Performance] Reduced update frequency to 1/${this.updateThrottleLevel}`)
    } else if (currentFPS > this.highPerformanceThreshold && this.updateThrottleLevel > 1) {
      // Performance good, decrease throttling
      this.updateThrottleLevel--
      console.log(`[Performance] Increased update frequency to 1/${this.updateThrottleLevel}`)
    }
  }

  /**
   * Get current FPS
   */
  getCurrentFPS(): number {
    if (this.frameTimings.length === 0) return 60

    const avgTime = this.frameTimings.reduce((a, b) => a + b, 0) / this.frameTimings.length
    return Math.round(1000 / avgTime)
  }

  /**
   * Get average frame time
   */
  getAverageFrameTime(): number {
    if (this.frameTimings.length === 0) return 16.67

    return this.frameTimings.reduce((a, b) => a + b, 0) / this.frameTimings.length
  }

  /**
   * Get update throttle level
   */
  getUpdateThrottleLevel(): number {
    return this.updateThrottleLevel
  }

  /**
   * Calculate vehicle update priority
   * Returns true if this vehicle should be updated this frame
   */
  shouldUpdateVehicle(vehicleId: string, frame: number, priority: number = 0): boolean {
    // Priority vehicles (emergency, in viewport) always update
    if (priority > 0) return true

    // Regular vehicles update based on throttle level
    const vehicleHash = this.hashString(vehicleId)
    return frame % this.updateThrottleLevel === vehicleHash % this.updateThrottleLevel
  }

  /**
   * Simple string hash for distribution
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Set auto-adapt mode
   */
  setAutoAdapt(enabled: boolean): void {
    this.autoAdapt = enabled
  }

  /**
   * Get performance metrics
   */
  getMetrics(
    vehicleCount: number,
    vehiclesUpdated: number,
    gridCells: number,
  ): PerformanceMetrics {
    const memoryUsage =
      typeof performance !== "undefined" && performance.memory
        ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
        : 0

    return {
      fps: this.getCurrentFPS(),
      updateTimeMs: this.getAverageFrameTime(),
      renderTimeMs: 0, // Would be measured by renderer
      memoryUsageMb: memoryUsage,
      vehicleCount,
      vehiclesUpdatedPerFrame: vehiclesUpdated,
      gridCellsActive: gridCells,
    }
  }
}

/**
 * Update Batch Processor
 * Processes vehicle updates in batches for cache efficiency
 */
export class UpdateBatchProcessor {
  private batchSize: number = 8
  private processingQueue: Array<() => void> = []
  private currentBatchIndex: number = 0

  /**
   * Add update to processing queue
   */
  queueUpdate(updateFn: () => void): void {
    this.processingQueue.push(updateFn)
  }

  /**
   * Process batches
   */
  processBatches(): void {
    let processed = 0
    const batchesPerFrame = Math.ceil(this.processingQueue.length / this.batchSize)

    // Process one batch per frame
    for (let i = 0; i < this.batchSize && this.currentBatchIndex + i < this.processingQueue.length; i++) {
      this.processingQueue[this.currentBatchIndex + i]()
      processed++
    }

    this.currentBatchIndex += processed

    if (this.currentBatchIndex >= this.processingQueue.length) {
      this.processingQueue = []
      this.currentBatchIndex = 0
    }
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.processingQueue.length
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.processingQueue = []
    this.currentBatchIndex = 0
  }
}

/**
 * Memory Pool for Vehicle Objects
 * Reduces garbage collection pressure
 */
export class VehicleObjectPool {
  private pool: any[] = []
  private maxPoolSize: number = 100
  private createdCount: number = 0

  /**
   * Acquire object from pool or create new
   */
  acquire(): any {
    if (this.pool.length > 0) {
      return this.pool.pop()
    }

    this.createdCount++
    return {}
  }

  /**
   * Return object to pool
   */
  release(obj: any): void {
    if (this.pool.length < this.maxPoolSize) {
      // Clear object properties
      for (const key in obj) {
        delete obj[key]
      }
      this.pool.push(obj)
    }
  }

  /**
   * Get pool stats
   */
  getStats(): { poolSize: number; created: number; available: number } {
    return {
      poolSize: this.pool.length,
      created: this.createdCount,
      available: this.maxPoolSize - this.pool.length,
    }
  }
}

/**
 * Frame Rate Limiter
 * Ensures consistent frame rate by pacing execution
 */
export class FrameRateLimiter {
  private targetFPS: number = 60
  private targetFrameTime: number = 1000 / 60
  private lastFrameTime: number = Date.now()
  private frameCount: number = 0

  /**
   * Wait if necessary to maintain target FPS
   */
  async limitFrame(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastFrameTime
    const needed = this.targetFrameTime - elapsed

    if (needed > 0) {
      await this.sleep(needed)
    }

    this.lastFrameTime = Date.now()
    this.frameCount++
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Set target FPS
   */
  setTargetFPS(fps: number): void {
    this.targetFPS = Math.max(15, Math.min(144, fps))
    this.targetFrameTime = 1000 / this.targetFPS
  }

  /**
   * Get current frame count
   */
  getFrameCount(): number {
    return this.frameCount
  }
}
