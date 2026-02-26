export interface Profile {
  id: string
  email: string
  full_name: string | null
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  user_id: string
  plan_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  status: "active" | "canceled" | "past_due"
  current_period_start: string | null
  current_period_end: string | null
  monthly_limit: number
  created_at: string
  updated_at: string
}

export interface Credit {
  id: string
  user_id: string
  balance: number
  total_purchased: number
  created_at: string
  updated_at: string
}

export interface Execution {
  id: string
  user_id: string
  status: "pending" | "processing" | "completed" | "failed"
  pdf_count: number
  image_count: number
  template_name: string | null
  output_url: string | null
  error_message: string | null
  used_credit: boolean
  processing_time_ms: number | null
  created_at: string
  completed_at: string | null
}
