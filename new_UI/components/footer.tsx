"use client"

export default function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-gray-200">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center">
            <span className="text-gray-900 text-lg font-semibold tracking-tight">ProReport</span>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-6 flex-wrap justify-center">
            <a
              href="#"
              className="text-gray-600 hover:text-gray-900 text-sm transition-colors"
            >
              利用規約
            </a>
            <a
              href="#"
              className="text-gray-600 hover:text-gray-900 text-sm transition-colors"
            >
              プライバシーポリシー
            </a>
            <a
              href="#"
              className="text-gray-600 hover:text-gray-900 text-sm transition-colors"
            >
              特定商取引法に基づく表記
            </a>
            <a
              href="#"
              className="text-gray-600 hover:text-gray-900 text-sm transition-colors"
            >
              お問い合わせ
            </a>
          </nav>

          {/* Copyright */}
          <p className="text-gray-500 text-xs">
            &copy; {new Date().getFullYear()} ProReport. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
