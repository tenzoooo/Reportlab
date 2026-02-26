"use client"

import GlassButton from "./glass-button"

export default function Header() {
  return (
    <header className="relative z-20 flex items-center justify-between p-6 text-gray-900">
      {/* Logo */}
      <div className="flex items-center">
        <span className="text-gray-900 text-xl font-semibold tracking-tight uppercase">Reportlab</span>
      </div>

      {/* Navigation - Japanese labels */}
      <nav className="flex items-center space-x-2">
        <a
          href="#features"
          className="text-gray-600 hover:text-gray-900 text-xs font-light px-3 py-2 rounded-full hover:bg-gray-100 transition-all duration-200"
        >
          機能
        </a>
        <a
          href="#pricing"
          className="text-gray-600 hover:text-gray-900 text-xs font-light px-3 py-2 rounded-full hover:bg-gray-100 transition-all duration-200"
        >
          料金
        </a>
      </nav>

      {/* Login Button - Japanese label */}
      <GlassButton variant="filled" className="px-6 py-2 h-8" href="/login">
        ログイン
      </GlassButton>
    </header>
  )
}
