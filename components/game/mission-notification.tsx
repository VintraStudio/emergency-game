"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, X } from "lucide-react"
import type { Mission } from "@/lib/game-types"
import { MISSION_CONFIGS } from "@/lib/game-types"
import "./mission-notification.css"

interface MissionNotificationProps {
  mission: Mission
  onClose: () => void
}

export function MissionNotification({ mission, onClose }: MissionNotificationProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300) // Wait for fade out animation
    }, 5000) // Auto-hide after 5 seconds

    return () => clearTimeout(timer)
  }, [onClose])

  const config = MISSION_CONFIGS[mission.type]
  const iconColor = config?.color || "#ef4444"

  if (!isVisible) return null

  return (
    <div className="mission-notification">
      <div
        className="mission-notification-content"
        style={{ "--notification-color": iconColor, borderColor: `${iconColor}30` } as React.CSSProperties}
      >
        <div className="mission-notification-icon" style={{ color: iconColor }}>
          <AlertTriangle size={20} />
        </div>
        <div className="mission-notification-text">
          <div className="mission-notification-title">Incoming Emergency</div>
          <div className="mission-notification-name">{mission.title}</div>
        </div>
        <button className="mission-notification-close" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
