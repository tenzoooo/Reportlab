"use client"

import { useRef, useState, type ReactNode, type MouseEvent } from "react"

type HoverEffect = "none" | "glow" | "shimmer" | "ripple" | "lift" | "scale"

interface GlassButtonProps {
  children: ReactNode
  variant?: "filled" | "outline" | "glass" | "glassSubtle"
  effect?: HoverEffect
  href?: string
  className?: string
  onClick?: () => void
  glass?: {
    color?: string
    blur?: number
    outline?: string
    shadow?: string
  }
}

export default function GlassButton({
  children,
  variant = "filled",
  effect = "glow",
  href,
  className = "",
  onClick,
  glass,
}: GlassButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseMove = (e: MouseEvent) => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const handleMouseEnter = () => setIsHovering(true)
  const handleMouseLeave = () => setIsHovering(false)

  // Base styles
  const baseStyles =
    "relative px-8 py-3 rounded-full text-sm font-medium transition-all duration-300 cursor-pointer overflow-hidden flex items-center justify-center text-center"

  // Variant styles with glass effects
  const variantStyles = {
    filled: "bg-gray-900 text-white",
    outline: "bg-transparent border border-gray-300 text-gray-900 hover:bg-gray-100",
    glass: `backdrop-blur-[${glass?.blur || 20}px] bg-gray-100/80 text-gray-900 border border-gray-200`,
    glassSubtle: "backdrop-blur-md bg-gray-50/80 text-gray-900 border border-gray-200",
  }

  // Effect styles
  const effectStyles = {
    none: "",
    glow: "hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]",
    shimmer: "",
    ripple: "",
    lift: "hover:-translate-y-1 hover:shadow-lg",
    scale: "hover:scale-105",
  }

  // Glass custom styles
  const glassCustomStyles = glass
    ? {
        backgroundColor: glass.color || "rgba(255, 255, 255, 0.1)",
        backdropFilter: `blur(${glass.blur || 20}px)`,
        border: glass.outline ? `1px solid ${glass.outline}` : undefined,
        boxShadow: glass.shadow,
      }
    : {}

  const Component = href ? "a" : "button"

  return (
    <Component
      ref={buttonRef as any}
      href={href}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${baseStyles} ${variantStyles[variant]} ${effectStyles[effect]} ${className}`}
      style={glass ? glassCustomStyles : undefined}
    >
      {/* Glow effect - cursor-following light */}
      {effect === "glow" && isHovering && (
        <span
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{
            background:
              variant === "filled"
                ? `radial-gradient(150px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(139, 92, 246, 0.4), transparent 50%)`
                : `radial-gradient(150px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255, 255, 255, 0.25), transparent 50%)`,
          }}
        />
      )}

      {/* Shimmer effect - moving gradient */}
      {effect === "shimmer" && (
        <span
          className={`pointer-events-none absolute inset-0 transition-transform duration-700 ${isHovering ? "translate-x-full" : "-translate-x-full"}`}
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)",
          }}
        />
      )}

      {/* Ripple effect */}
      {effect === "ripple" && isHovering && (
        <span
          className="pointer-events-none absolute rounded-full animate-ping"
          style={{
            left: mousePosition.x - 10,
            top: mousePosition.y - 10,
            width: 20,
            height: 20,
            backgroundColor: variant === "filled" ? "rgba(139, 92, 246, 0.3)" : "rgba(255, 255, 255, 0.3)",
          }}
        />
      )}

      {/* Border glow for outline/glass variants */}
      {(variant === "outline" || variant === "glass" || variant === "glassSubtle") &&
        effect === "glow" &&
        isHovering && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(180px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(139, 92, 246, 0.15), transparent 40%)`,
            }}
          />
        )}

      <span className="relative z-10">{children}</span>
    </Component>
  )
}
