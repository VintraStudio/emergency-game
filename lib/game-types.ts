export type BuildingType =
  | "fire-station"
  | "police-station"
  | "hospital"
  | "ambulance-station"
  | "medical-clinic"
  | "road-authority"
  | "morgue"

export type BuildingSize = "small" | "large"

export type MissionType =
  | "fire"
  | "traffic-accident"
  | "medical-emergency"
  | "crime"
  | "infrastructure"

export type MissionStatus = "pending" | "dispatched" | "in-progress" | "completed" | "failed"

export type VehicleStatus = "idle" | "dispatched" | "returning" | "working"

export interface Position {
  x: number
  y: number
}

export interface RoadNode {
  id: string
  x: number
  y: number
  connections: string[]
}

export interface RoadSegment {
  from: string
  to: string
  path?: Position[]  // for curved roads
}

export interface Building {
  id: string
  type: BuildingType
  size: BuildingSize
  level: number
  name: string
  position: Position
  nearestRoadNode: string
  vehicles: Vehicle[]
  staff: number
  maxStaff: number
  upgrades: string[]
  cost: number
  efficiency: number
}

export interface Vehicle {
  id: string
  type: string
  buildingId: string
  status: VehicleStatus
  position: Position
  path: Position[]
  pathIndex: number
  targetPosition?: Position
  speed: number
  missionId?: string
  workTimeRemaining: number
}

export interface Mission {
  id: string
  type: MissionType
  title: string
  description: string
  position: Position
  nearestRoadNode: string
  status: MissionStatus
  reward: number
  penalty: number
  timeLimit: number
  timeRemaining: number
  requiredBuildings: BuildingType[]
  dispatchedVehicles: string[]
  workDuration: number
  createdAt: number
}

export interface GameState {
  money: number
  population: number
  buildings: Building[]
  missions: Mission[]
  vehicles: Vehicle[]
  gameTime: number
  isPaused: boolean
  gameOver: boolean
  selectedBuilding: Building | null
  selectedMission: Mission | null
  placingBuilding: BuildingType | null
  managingBuilding: Building | null
  missionsCompleted: number
  missionsFailed: number
}

export interface CityZone {
  id: string
  type: "residential" | "commercial" | "industrial" | "public"
  name: string
  position: Position
  width: number
  height: number
}

export interface CityStructure {
  id: string
  type: "office" | "school" | "house" | "apartment" | "shop" | "park-building" | "factory"
  position: Position
  width: number
  height: number
  color: string
  roofColor: string
}

export interface ParkArea {
  id: string
  position: Position
  width: number
  height: number
  trees: Position[]
  bushes: Position[]
}

export const BUILDING_CONFIGS: Record<
  BuildingType,
  {
    name: string
    icon: string
    smallCost: number
    largeCost: number
    upgradeCost: number
    staffCost: number
    vehicleCost: number
    color: string
    vehicles: { type: string; count: number }[]
    maxLevel: number
  }
> = {
  "fire-station": {
    name: "Fire Station",
    icon: "Flame",
    smallCost: 3000,
    largeCost: 6000,
    upgradeCost: 4000,
    staffCost: 500,
    vehicleCost: 2000,
    color: "hsl(16, 85%, 55%)",
    vehicles: [{ type: "Fire Truck", count: 2 }],
    maxLevel: 3,
  },
  "police-station": {
    name: "Police Station",
    icon: "Shield",
    smallCost: 2500,
    largeCost: 5000,
    upgradeCost: 3500,
    staffCost: 400,
    vehicleCost: 1500,
    color: "hsl(220, 75%, 55%)",
    vehicles: [{ type: "Patrol Car", count: 3 }],
    maxLevel: 3,
  },
  hospital: {
    name: "Hospital",
    icon: "Heart",
    smallCost: 5000,
    largeCost: 10000,
    upgradeCost: 6000,
    staffCost: 600,
    vehicleCost: 2500,
    color: "hsl(0, 72%, 55%)",
    vehicles: [{ type: "Ambulance", count: 2 }],
    maxLevel: 3,
  },
  "ambulance-station": {
    name: "Ambulance Station",
    icon: "Siren",
    smallCost: 2000,
    largeCost: 4000,
    upgradeCost: 2500,
    staffCost: 350,
    vehicleCost: 1800,
    color: "hsl(0, 72%, 55%)",
    vehicles: [{ type: "Ambulance", count: 3 }],
    maxLevel: 3,
  },
  "medical-clinic": {
    name: "Medical Clinic",
    icon: "Stethoscope",
    smallCost: 1500,
    largeCost: 3000,
    upgradeCost: 2000,
    staffCost: 300,
    vehicleCost: 1200,
    color: "hsl(340, 65%, 55%)",
    vehicles: [{ type: "Medical Van", count: 1 }],
    maxLevel: 3,
  },
  "road-authority": {
    name: "Road Authority",
    icon: "Construction",
    smallCost: 2000,
    largeCost: 4000,
    upgradeCost: 2500,
    staffCost: 350,
    vehicleCost: 1500,
    color: "hsl(38, 90%, 55%)",
    vehicles: [{ type: "Utility Truck", count: 2 }],
    maxLevel: 3,
  },
  morgue: {
    name: "Morgue",
    icon: "Building2",
    smallCost: 1500,
    largeCost: 3000,
    upgradeCost: 2000,
    staffCost: 250,
    vehicleCost: 1000,
    color: "hsl(220, 10%, 50%)",
    vehicles: [{ type: "Transport Van", count: 1 }],
    maxLevel: 3,
  },
}

export const MISSION_CONFIGS: Record<
  MissionType,
  {
    titles: string[]
    descriptions: string[]
    baseReward: number
    basePenalty: number
    baseTimeLimit: number
    workDuration: number
    requiredBuildings: BuildingType[]
    icon: string
    color: string
  }
> = {
  fire: {
    titles: ["Building Fire", "House Fire", "Warehouse Fire", "Car Fire"],
    descriptions: [
      "A fire has broken out in the downtown area!",
      "Residential fire reported, residents in danger!",
      "Warehouse ablaze, chemicals on site!",
      "Vehicle fire on the highway!",
    ],
    baseReward: 1500,
    basePenalty: 800,
    baseTimeLimit: 60,
    workDuration: 10,
    requiredBuildings: ["fire-station"],
    icon: "Flame",
    color: "hsl(16, 85%, 55%)",
  },
  "traffic-accident": {
    titles: ["Traffic Collision", "Highway Pileup", "Pedestrian Accident", "Bus Accident"],
    descriptions: [
      "Multi-vehicle collision on Main Street!",
      "Major pileup on the highway!",
      "Pedestrian struck near the school zone!",
      "Bus accident downtown, multiple injuries!",
    ],
    baseReward: 1200,
    basePenalty: 600,
    baseTimeLimit: 45,
    workDuration: 8,
    requiredBuildings: ["ambulance-station", "police-station"],
    icon: "CarFront",
    color: "hsl(38, 90%, 55%)",
  },
  "medical-emergency": {
    titles: ["Heart Attack", "Stroke Alert", "Allergic Reaction", "Injury Report"],
    descriptions: [
      "Cardiac emergency at the office complex!",
      "Stroke suspected at residential address!",
      "Severe allergic reaction at the restaurant!",
      "Serious injury reported at construction site!",
    ],
    baseReward: 1000,
    basePenalty: 500,
    baseTimeLimit: 30,
    workDuration: 6,
    requiredBuildings: ["hospital", "ambulance-station"],
    icon: "HeartPulse",
    color: "hsl(0, 72%, 55%)",
  },
  crime: {
    titles: ["Robbery in Progress", "Assault Reported", "Break-in Alert", "Suspicious Activity"],
    descriptions: [
      "Armed robbery at the downtown bank!",
      "Assault reported near the park!",
      "Break-in at commercial property!",
      "Suspicious activity reported by residents!",
    ],
    baseReward: 1300,
    basePenalty: 700,
    baseTimeLimit: 40,
    workDuration: 8,
    requiredBuildings: ["police-station"],
    icon: "ShieldAlert",
    color: "hsl(220, 75%, 55%)",
  },
  infrastructure: {
    titles: ["Road Collapse", "Water Main Break", "Power Line Down", "Sinkhole"],
    descriptions: [
      "Road has collapsed on 5th Avenue!",
      "Water main burst flooding the street!",
      "Power line down, area unsafe!",
      "Sinkhole forming near residential area!",
    ],
    baseReward: 800,
    basePenalty: 400,
    baseTimeLimit: 90,
    workDuration: 15,
    requiredBuildings: ["road-authority"],
    icon: "AlertTriangle",
    color: "hsl(38, 90%, 55%)",
  },
}
