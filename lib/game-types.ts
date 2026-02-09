export type GameSpeed = 1 | 2 | 3

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

// Geographic position using lat/lng for Leaflet
export interface LatLng {
  lat: number
  lng: number
}

export interface Building {
  id: string
  type: BuildingType
  size: BuildingSize
  level: number
  name: string
  position: LatLng
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
  position: LatLng
  routeCoords: LatLng[] // full OSRM route coordinates
  routeIndex: number    // current index along routeCoords
  missionId?: string
  workTimeRemaining: number
}

export interface Mission {
  id: string
  type: MissionType
  title: string
  description: string
  position: LatLng
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

export interface CityConfig {
  id: string
  name: string
  country: string
  center: LatLng
  zoom: number
  population: number
  bounds: { north: number; south: number; east: number; west: number }
}

export interface GameState {
  money: number
  population: number
  buildings: Building[]
  missions: Mission[]
  vehicles: Vehicle[]
  gameTime: number  // Current game time (real-time adjusted)
  gameStartTime: number  // When game was started (real timestamp)
  gameSpeed: GameSpeed
  isPaused: boolean
  gameOver: boolean
  selectedBuilding: Building | null
  selectedMission: Mission | null
  placingBuilding: BuildingType | null
  managingBuilding: Building | null
  missionsCompleted: number
  missionsFailed: number
  city: CityConfig | null
}

export const CITY_OPTIONS: CityConfig[] = [
  {
    id: "oslo",
    name: "Oslo",
    country: "Norway",
    center: { lat: 59.9139, lng: 10.7522 },
    zoom: 14,
    population: 709000,
    bounds: { north: 59.935, south: 59.895, east: 10.795, west: 10.710 },
  },
  {
    id: "copenhagen",
    name: "Copenhagen",
    country: "Denmark",
    center: { lat: 55.6761, lng: 12.5683 },
    zoom: 14,
    population: 812000,
    bounds: { north: 55.695, south: 55.657, east: 12.610, west: 12.527 },
  },
  {
    id: "stockholm",
    name: "Stockholm",
    country: "Sweden",
    center: { lat: 59.3293, lng: 18.0686 },
    zoom: 14,
    population: 990000,
    bounds: { north: 59.348, south: 59.310, east: 18.110, west: 18.028 },
  },
  {
    id: "helsinki",
    name: "Helsinki",
    country: "Finland",
    center: { lat: 60.1699, lng: 24.9384 },
    zoom: 14,
    population: 670000,
    bounds: { north: 60.188, south: 60.152, east: 24.980, west: 24.897 },
  },
  {
    id: "london",
    name: "London",
    country: "United Kingdom",
    center: { lat: 51.5074, lng: -0.1278 },
    zoom: 14,
    population: 9000000,
    bounds: { north: 51.525, south: 51.490, east: -0.085, west: -0.170 },
  },
  {
    id: "berlin",
    name: "Berlin",
    country: "Germany",
    center: { lat: 52.5200, lng: 13.4050 },
    zoom: 14,
    population: 3700000,
    bounds: { north: 52.538, south: 52.502, east: 13.448, west: 13.362 },
  },
]

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
    color: "#e86430",
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
    color: "#4488ee",
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
    color: "#e04444",
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
    color: "#e04444",
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
    color: "#cc4488",
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
    color: "#ddaa22",
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
    color: "#778899",
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
    baseTimeLimit: 30,  // 30 minutes
    workDuration: 10,
    requiredBuildings: ["fire-station"],
    icon: "Flame",
    color: "#e86430",
  },
  "traffic-accident": {
    titles: ["Traffic Collision", "Highway Pileup", "Pedestrian Accident", "Bus Accident"],
    descriptions: [
      "Multi-vehicle collision on a main road!",
      "Major pileup on the highway!",
      "Pedestrian struck near the school zone!",
      "Bus accident downtown, multiple injuries!",
    ],
    baseReward: 1200,
    basePenalty: 600,
    baseTimeLimit: 20,  // 20 minutes
    workDuration: 8,
    requiredBuildings: ["ambulance-station", "police-station"],
    icon: "CarFront",
    color: "#ddaa22",
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
    baseTimeLimit: 15,  // 15 minutes
    workDuration: 6,
    requiredBuildings: ["hospital", "ambulance-station"],
    icon: "HeartPulse",
    color: "#e04444",
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
    baseTimeLimit: 25,  // 25 minutes
    workDuration: 8,
    requiredBuildings: ["police-station"],
    icon: "ShieldAlert",
    color: "#4488ee",
  },
  infrastructure: {
    titles: ["Road Collapse", "Water Main Break", "Power Line Down", "Sinkhole"],
    descriptions: [
      "Road has collapsed on a major street!",
      "Water main burst flooding the street!",
      "Power line down, area unsafe!",
      "Sinkhole forming near residential area!",
    ],
    baseReward: 800,
    basePenalty: 400,
    baseTimeLimit: 45,  // 45 minutes
    workDuration: 15,
    requiredBuildings: ["road-authority"],
    icon: "AlertTriangle",
    color: "#ddaa22",
  },
}
