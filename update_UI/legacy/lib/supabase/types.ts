// lib/supabase/types.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      analysis_results: {
        Row: {
          created_at: string | null
          dify_response: Json | null
          graphs: Json | null
          id: string
          report_id: string
          statistics: Json | null
        }
        Insert: {
          created_at?: string | null
          dify_response?: Json | null
          graphs?: Json | null
          id?: string
          report_id: string
          statistics?: Json | null
        }
        Update: {
          created_at?: string | null
          dify_response?: Json | null
          graphs?: Json | null
          id?: string
          report_id?: string
          statistics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'analysis_results_report_id_fkey'
            columns: ['report_id']
            isOneToOne: false
            referencedRelation: 'reports'
            referencedColumns: ['id']
          }
        ]
      }
      experiment_data: {
        Row: {
          file_name: string
          file_type: 'excel' | 'image' | 'code' | 'word'
          file_url: string
          id: string
          report_id: string
          uploaded_at: string | null
        }
        Insert: {
          file_name: string
          file_type: 'excel' | 'image' | 'code' | 'word'
          file_url: string
          id?: string
          report_id: string
          uploaded_at?: string | null
        }
        Update: {
          file_name?: string
          file_type?: 'excel' | 'image' | 'code' | 'word'
          file_url?: string
          id?: string
          report_id?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'experiment_data_report_id_fkey'
            columns: ['report_id']
            isOneToOne: false
            referencedRelation: 'reports'
            referencedColumns: ['id']
          }
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          file_url: string | null
          id: string
          status: 'draft' | 'processing' | 'completed' | 'error'
          template_data: Json | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          status?: 'draft' | 'processing' | 'completed' | 'error'
          template_data?: Json | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          status?: 'draft' | 'processing' | 'completed' | 'error'
          template_data?: Json | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reports_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          stripe_customer_id: string | null
          subscription_status: 'free' | 'premium'
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          stripe_customer_id?: string | null
          subscription_status?: 'free' | 'premium'
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          stripe_customer_id?: string | null
          subscription_status?: 'free' | 'premium'
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'users_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      stripe_customers: {
        Row: {
          user_id: string
          stripe_customer_id: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          user_id: string
          stripe_customer_id: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          user_id?: string
          stripe_customer_id?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'stripe_customers_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
