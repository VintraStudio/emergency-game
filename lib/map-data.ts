import type { CityZone, CityStructure, ParkArea, Position } from "./game-types"

// ---- ZONES (1600x1000) ----
export const CITY_ZONES: CityZone[] = [
  { id: "z1", type: "residential", name: "Elm Heights",    position: { x: 60,  y: 60 },  width: 260, height: 170 },
  { id: "z2", type: "commercial", name: "Downtown",        position: { x: 380, y: 60 },  width: 240, height: 170 },
  { id: "z3", type: "residential", name: "Oak Park",       position: { x: 680, y: 60 },  width: 240, height: 170 },
  { id: "z10",type: "commercial", name: "Tech Quarter",    position: { x: 980, y: 60 },  width: 240, height: 170 },
  { id: "z11",type: "residential", name: "Maple Ridge",    position: { x: 1280,y: 60 },  width: 240, height: 170 },

  { id: "z4", type: "industrial", name: "Steel District",  position: { x: 60,  y: 270 }, width: 260, height: 180 },
  { id: "z5", type: "public",     name: "Civic Center",    position: { x: 380, y: 270 }, width: 240, height: 180 },
  { id: "z12",type: "residential", name: "Harbor View",    position: { x: 680, y: 270 }, width: 240, height: 180 },
  { id: "z13",type: "commercial", name: "Business Park",   position: { x: 980, y: 270 }, width: 240, height: 180 },
  { id: "z14",type: "industrial", name: "Foundry Row",     position: { x: 1280,y: 270 }, width: 240, height: 180 },

  { id: "z6", type: "residential", name: "Riverside",      position: { x: 60,  y: 490 }, width: 260, height: 180 },
  { id: "z15",type: "public",     name: "Central Park",    position: { x: 380, y: 490 }, width: 240, height: 180 },
  { id: "z16",type: "residential", name: "Brookside",      position: { x: 680, y: 490 }, width: 240, height: 180 },
  { id: "z17",type: "commercial", name: "Market District",  position: { x: 980, y: 490 }, width: 240, height: 180 },
  { id: "z18",type: "residential", name: "Pine Valley",    position: { x: 1280,y: 490 }, width: 240, height: 180 },

  { id: "z7", type: "commercial", name: "Market Square",   position: { x: 60,  y: 710 }, width: 260, height: 160 },
  { id: "z8", type: "public",     name: "University",      position: { x: 380, y: 710 }, width: 240, height: 160 },
  { id: "z9", type: "residential", name: "Hilltop",        position: { x: 680, y: 710 }, width: 240, height: 160 },
  { id: "z19",type: "industrial", name: "Dock Yards",      position: { x: 980, y: 710 }, width: 240, height: 160 },
  { id: "z20",type: "residential", name: "Sunset Hills",   position: { x: 1280,y: 710 }, width: 240, height: 160 },
]

// ---- STRUCTURES (decorative background buildings) ----
function makeStructures(): CityStructure[] {
  const structures: CityStructure[] = []
  let id = 0

  const genBuildings = (zx: number, zy: number, zw: number, zh: number, type: CityZone["type"]) => {
    const margin = 24
    const cols = Math.floor((zw - margin * 2) / 50)
    const rows = Math.floor((zh - margin * 2 - 14) / 44)

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Skip some randomly for variety
        const hash = (zx * 13 + zy * 7 + r * 31 + c * 17 + id) % 10
        if (hash < 3) continue

        const bw = 28 + (hash % 3) * 6
        const bh = 22 + (hash % 4) * 5
        const x = zx + margin + c * 50 + (hash % 2) * 4
        const y = zy + margin + 14 + r * 44 + (hash % 3) * 2

        let color = "hsl(220, 14%, 18%)"
        let roofColor = "hsl(220, 14%, 22%)"

        if (type === "residential") {
          color = hash % 2 === 0 ? "hsl(220, 14%, 19%)" : "hsl(200, 10%, 20%)"
          roofColor = hash % 2 === 0 ? "hsl(220, 14%, 24%)" : "hsl(200, 10%, 25%)"
        } else if (type === "commercial") {
          color = hash % 2 === 0 ? "hsl(220, 16%, 20%)" : "hsl(230, 12%, 21%)"
          roofColor = hash % 2 === 0 ? "hsl(220, 16%, 26%)" : "hsl(230, 12%, 27%)"
        } else if (type === "industrial") {
          color = "hsl(215, 8%, 18%)"
          roofColor = "hsl(215, 8%, 23%)"
        } else {
          color = "hsl(210, 12%, 19%)"
          roofColor = "hsl(210, 12%, 24%)"
        }

        const bType: CityStructure["type"] = type === "residential"
          ? (hash % 3 === 0 ? "house" : "apartment")
          : type === "commercial"
          ? (hash % 3 === 0 ? "shop" : "office")
          : type === "industrial"
          ? "factory"
          : "office"

        structures.push({
          id: `s-${id++}`,
          type: bType,
          position: { x, y },
          width: bw,
          height: bh,
          color,
          roofColor,
        })
      }
    }
  }

  for (const z of CITY_ZONES) {
    if (z.name === "Central Park") continue // parks don't have buildings
    genBuildings(z.position.x, z.position.y, z.width, z.height, z.type)
  }

  return structures
}

export const CITY_STRUCTURES = makeStructures()

// ---- PARKS & GREENERY ----
function makeParkAreas(): ParkArea[] {
  const parks: ParkArea[] = []
  let id = 0

  // Central Park
  const cpTrees: Position[] = []
  const cpBushes: Position[] = []
  for (let i = 0; i < 35; i++) {
    cpTrees.push({
      x: 395 + Math.sin(i * 2.3) * 100 + (i % 7) * 28,
      y: 510 + Math.cos(i * 1.7) * 70 + (i % 5) * 24,
    })
  }
  for (let i = 0; i < 25; i++) {
    cpBushes.push({
      x: 400 + (i % 8) * 26 + Math.sin(i) * 10,
      y: 520 + Math.floor(i / 8) * 40 + Math.cos(i) * 8,
    })
  }
  parks.push({ id: `park-${id++}`, position: { x: 380, y: 490 }, width: 240, height: 180, trees: cpTrees, bushes: cpBushes })

  // Smaller green areas scattered around
  const smallParks = [
    { x: 120, y: 470, w: 60, h: 40 },
    { x: 740, y: 460, w: 55, h: 35 },
    { x: 1040, y: 460, w: 50, h: 35 },
    { x: 1340, y: 460, w: 50, h: 35 },
    { x: 300, y: 700, w: 50, h: 30 },
    { x: 600, y: 700, w: 45, h: 30 },
    { x: 900, y: 700, w: 50, h: 30 },
    { x: 1200, y: 700, w: 45, h: 30 },
  ]

  for (const sp of smallParks) {
    const trees: Position[] = []
    const bushes: Position[] = []
    for (let i = 0; i < 6; i++) {
      trees.push({ x: sp.x + 8 + (i % 3) * (sp.w / 3), y: sp.y + 8 + Math.floor(i / 3) * (sp.h / 2) })
    }
    for (let i = 0; i < 4; i++) {
      bushes.push({ x: sp.x + 5 + i * (sp.w / 4), y: sp.y + sp.h - 8 })
    }
    parks.push({ id: `park-${id++}`, position: { x: sp.x, y: sp.y }, width: sp.w, height: sp.h, trees, bushes })
  }

  return parks
}

export const PARK_AREAS = makeParkAreas()

export const ZONE_COLORS: Record<CityZone["type"], { fill: string; stroke: string; label: string }> = {
  residential: { fill: "rgba(74, 222, 128, 0.05)", stroke: "rgba(74, 222, 128, 0.15)", label: "rgba(74, 222, 128, 0.5)" },
  commercial:  { fill: "rgba(251, 191, 36, 0.05)", stroke: "rgba(251, 191, 36, 0.15)", label: "rgba(251, 191, 36, 0.5)" },
  industrial:  { fill: "rgba(156, 163, 175, 0.05)", stroke: "rgba(156, 163, 175, 0.15)", label: "rgba(156, 163, 175, 0.5)" },
  public:      { fill: "rgba(96, 165, 250, 0.05)", stroke: "rgba(96, 165, 250, 0.15)", label: "rgba(96, 165, 250, 0.5)" },
}
