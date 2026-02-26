"use client"

import { useState } from "react"
import { Search, FileText, Clock, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface SearchResult {
  id: string
  title: string
  date: string
  status: string
  type: "report" | "draft"
}

export function SearchDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])

  // Mock search results
  const mockResults: SearchResult[] = [
    { id: "1", title: "実験1のレポート", date: "2024-01-15", status: "完了", type: "report" },
    { id: "2", title: "実験2のレポート", date: "2024-01-14", status: "処理中", type: "report" },
    { id: "3", title: "化学反応実験", date: "2024-01-10", status: "完了", type: "report" },
    { id: "4", title: "物理実験レポート", date: "2024-01-08", status: "完了", type: "report" },
    { id: "5", title: "生物学実験", date: "2024-01-05", status: "下書き", type: "draft" },
  ]

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim() === "") {
      setResults([])
      return
    }

    // Filter mock results based on query
    const filtered = mockResults.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))
    setResults(filtered)
  }

  const handleClose = () => {
    setIsOpen(false)
    setSearchQuery("")
    setResults([])
  }

  return (
    <>
      <Button variant="ghost" size="icon" className="hidden sm:flex" onClick={() => setIsOpen(true)}>
        <Search className="h-5 w-5 text-muted-foreground" />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
              onClick={handleClose}
            />

            {/* Search Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.2 }}
              className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 px-4"
            >
              <div className="bg-card rounded-xl shadow-2xl overflow-hidden border border-border">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
                  <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <Input
                    id="global-search"
                    name="q"
                    type="search"
                    role="searchbox"
                    aria-label="レポートを検索"
                    placeholder="レポートを検索..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base bg-transparent"
                    autoComplete="off"
                    autoFocus
                  />
                  <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={handleClose}>
                    <X className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </div>

                {/* Search Results */}
                <div className="max-h-96 overflow-y-auto">
                  {searchQuery === "" ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">レポートを検索してください</p>
                    </div>
                  ) : results.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">該当するレポートが見つかりませんでした</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {results.map((result) => (
                        <Link
                          key={result.id}
                          href={`/dashboard/reports`}
                          onClick={handleClose}
                          className="block px-4 py-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <FileText className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-foreground truncate">{result.title}</h4>
                              <div className="flex items-center gap-3 mt-1">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>{result.date}</span>
                                </div>
                                <span
                                  className={cn(
                                    "text-xs px-2 py-0.5 rounded",
                                    result.status === "完了"
                                      ? "bg-green-500/10 text-green-500"
                                      : result.status === "処理中"
                                        ? "bg-primary/10 text-primary"
                                        : "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {result.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {results.length > 0 && (
                  <div className="px-4 py-3 bg-muted/30 border-t border-border">
                    <Link
                      href="/dashboard/reports"
                      onClick={handleClose}
                      className="text-sm text-primary hover:text-primary/80 font-medium"
                    >
                      すべてのレポートを見る →
                    </Link>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}