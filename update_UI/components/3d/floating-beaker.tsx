"use client"

import { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Float, Environment } from "@react-three/drei"
import type * as THREE from "three"

function BeakerModel() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.2
    }
  })

  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.8, 1, 2, 32]} />
        <meshPhysicalMaterial
          color="#3B82F6"
          transparent
          opacity={0.6}
          roughness={0.1}
          metalness={0.3}
          transmission={0.9}
          thickness={0.5}
        />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.3, 0.8, 0.3, 32]} />
        <meshPhysicalMaterial
          color="#3B82F6"
          transparent
          opacity={0.6}
          roughness={0.1}
          metalness={0.3}
          transmission={0.9}
          thickness={0.5}
        />
      </mesh>
      {/* Liquid inside */}
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.75, 0.95, 1.2, 32]} />
        <meshPhysicalMaterial color="#8B5CF6" transparent opacity={0.7} roughness={0.2} metalness={0.1} />
      </mesh>
    </Float>
  )
}

export default function FloatingBeaker() {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <pointLight position={[-10, -10, -5]} intensity={0.5} color="#8B5CF6" />
        <BeakerModel />
        <Environment preset="studio" />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  )
}
