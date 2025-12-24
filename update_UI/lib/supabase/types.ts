export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/**
 * Minimal Supabase Database type placeholder.
 * - The report-generation backend used to rely on generated types under `legacy/`.
 * - Keep this file so other API routes can type the admin client without importing deleted legacy code.
 * - Replace with generated types when you finalize the new schema.
 */
export type Database = any
