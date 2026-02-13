"use client"

import { useState, useEffect, useRef } from "react"
import {
  Siren,
  Building2,
  Map,
  Zap,
  Truck,
  DollarSign,
  ArrowRight,
  ChevronRight,
} from "lucide-react"
import "./tutorial-overlay.css"

interface TutorialStep {
  id: string
  title: string
  description: string
  icon: typeof Siren
  iconColor: string
  /** CSS selector for the element to spotlight. null = centered overlay (welcome/final) */
  spotlightSelector: string | null
  /** Position of the tutorial card relative to the spotlight */
  cardPosition: "right" | "bottom" | "center"
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome, Director!",
    description:
      "You are now in charge of emergency services for this city. Build stations, dispatch vehicles, and keep the city safe. Let's walk through the basics.",
    icon: Siren,
    iconColor: "#3b82f6",
    spotlightSelector: null,
    cardPosition: "center",
  },
  {
    id: "building",
    title: "Build Your Stations",
    description:
      "Start by placing emergency buildings on the map. Each building type handles different emergencies. Click a building, then click on the map to place it.",
    icon: Building2,
    iconColor: "#22c55e",
    spotlightSelector: ".game-sidebar",
    cardPosition: "right",
  },
  {
    id: "map",
    title: "Explore the City",
    description:
      "This is your city. Zoom in to see detailed mission animations and traffic. Zoom out for a strategic overview of all active emergencies. Watch for NPC traffic -- it will slow your vehicles!",
    icon: Map,
    iconColor: "#3b82f6",
    spotlightSelector: ".game-map-container",
    cardPosition: "center",
  },
  {
    id: "missions",
    title: "Respond to Emergencies",
    description:
      "Emergencies will appear on the map with blinking alerts. Click the Missions tab to view all active missions and dispatch vehicles from nearby stations.",
    icon: Zap,
    iconColor: "#f59e0b",
    spotlightSelector: ".game-tabs-list",
    cardPosition: "bottom",
  },
  {
    id: "dispatch",
    title: "Dispatch Vehicles",
    description:
      "When a mission appears, click it and dispatch vehicles from your stations. Vehicles follow real roads and are affected by traffic. They park at the scene while working.",
    icon: Truck,
    iconColor: "#e86430",
    spotlightSelector: null,
    cardPosition: "center",
  },
  {
    id: "budget",
    title: "Manage Your Budget",
    description:
      "Completing missions earns money. Failing them costs you. Build wisely, respond quickly, and don't go bankrupt! Good luck, Director.",
    icon: DollarSign,
    iconColor: "#22c55e",
    spotlightSelector: ".hud-resources",
    cardPosition: "bottom",
  },
]

interface TutorialOverlayProps {
  cityName: string
  onComplete: () => void
}

export function TutorialOverlay({ cityName, onComplete }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const step = TUTORIAL_STEPS[currentStep]

  // Update spotlight position
  useEffect(() => {
    if (!step.spotlightSelector) {
      setSpotlightRect(null)
      return
    }

    const el = document.querySelector(step.spotlightSelector)
    if (el) {
      const rect = el.getBoundingClientRect()
      setSpotlightRect(rect)
    }

    // Re-calculate on resize
    function onResize() {
      const el = document.querySelector(step.spotlightSelector!)
      if (el) setSpotlightRect(el.getBoundingClientRect())
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [currentStep, step.spotlightSelector])

  function handleNext() {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onComplete()
    }
  }

  function handleSkip() {
    onComplete()
  }

  const Icon = step.icon
  const isLast = currentStep === TUTORIAL_STEPS.length - 1
  const isCentered = step.cardPosition === "center" || !spotlightRect

  // Calculate card position based on spotlight
  let cardStyle: React.CSSProperties = {}
  if (!isCentered && spotlightRect) {
    if (step.cardPosition === "right") {
      cardStyle = {
        top: spotlightRect.top + 20,
        left: spotlightRect.right + 16,
      }
    } else if (step.cardPosition === "bottom") {
      cardStyle = {
        top: spotlightRect.bottom + 16,
        left: spotlightRect.left + Math.min(spotlightRect.width / 2, 100) - 170,
      }
    }
  }

  return (
    <div className="tutorial-overlay">
      {/* Backdrop - click to skip (for advanced users) */}
      {!spotlightRect && <div className="tutorial-backdrop" />}

      {/* Spotlight */}
      {spotlightRect && (
        <div
          className="tutorial-spotlight"
          style={{
            top: spotlightRect.top - 8,
            left: spotlightRect.left - 8,
            width: spotlightRect.width + 16,
            height: spotlightRect.height + 16,
          }}
        />
      )}

      {/* Instruction Card */}
      <div
        ref={cardRef}
        className={`tutorial-card ${isCentered ? "centered" : ""}`}
        style={!isCentered ? cardStyle : undefined}
      >
        {/* Step indicators */}
        <div className="tutorial-step-indicator">
          {TUTORIAL_STEPS.map((_, i) => (
            <div
              key={i}
              className={`tutorial-step-dot ${i === currentStep ? "active" : i < currentStep ? "done" : ""}`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="tutorial-icon" style={{ background: `${step.iconColor}20` }}>
          <Icon
            style={{ color: step.iconColor, width: 22, height: 22 }}
          />
        </div>

        {/* Content */}
        <h3 className="tutorial-title">{step.title}</h3>
        <p className="tutorial-description">
          {step.description.replace("{cityName}", cityName)}
        </p>

        {/* Actions */}
        <div className="tutorial-actions">
          <button className="tutorial-skip" onClick={handleSkip}>
            Skip Tutorial
          </button>
          <button className="tutorial-next" onClick={handleNext}>
            {isLast ? "Start Playing" : "Next"}
            <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
    </div>
  )
}
