export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ai_content: {
        Row: {
          user_id: string;
          date_iso: string;
          language: string;
          data: Json;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          date_iso: string;
          language: string;
          data: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          date_iso?: string;
          language?: string;
          data?: Json;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      billing_orders: {
        Row: {
          order_id: string;
          user_id: string;
          plan_tier: string;
          amount: number;
          currency: string;
          status: string;
          order_name: string;
          payment_key: string | null;
          fail_code: string | null;
          fail_message: string | null;
          toss_response: Json | null;
          approved_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          order_id: string;
          user_id: string;
          plan_tier: string;
          amount: number;
          currency?: string;
          status?: string;
          order_name: string;
          payment_key?: string | null;
          fail_code?: string | null;
          fail_message?: string | null;
          toss_response?: Json | null;
          approved_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          order_id?: string;
          user_id?: string;
          plan_tier?: string;
          amount?: number;
          currency?: string;
          status?: string;
          order_name?: string;
          payment_key?: string | null;
          fail_code?: string | null;
          fail_message?: string | null;
          toss_response?: Json | null;
          approved_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      wnl_daily_logs: {
        Row: {
          device_id: string;
          date_iso: string;
          payload: Json;
          client_updated_at: number;
          updated_at: string | null;
        };
        Insert: {
          device_id: string;
          date_iso: string;
          payload: Json;
          client_updated_at: number;
          updated_at?: string | null;
        };
        Update: {
          device_id?: string;
          date_iso?: string;
          payload?: Json;
          client_updated_at?: number;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      wnl_user_state: {
        Row: {
          user_id: string;
          payload: Json;
          updated_at: string | null;
        };
        Insert: {
          user_id: string;
          payload: Json;
          updated_at?: string | null;
        };
        Update: {
          user_id?: string;
          payload?: Json;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      wnl_users: {
        Row: {
          user_id: string;
          created_at: string | null;
          last_seen: string | null;
          subscription_tier: string;
          subscription_status: string;
          subscription_started_at: string | null;
          subscription_current_period_end: string | null;
          subscription_updated_at: string | null;
          toss_customer_key: string | null;
          toss_last_order_id: string | null;
        };
        Insert: {
          user_id: string;
          created_at?: string | null;
          last_seen?: string | null;
          subscription_tier?: string;
          subscription_status?: string;
          subscription_started_at?: string | null;
          subscription_current_period_end?: string | null;
          subscription_updated_at?: string | null;
          toss_customer_key?: string | null;
          toss_last_order_id?: string | null;
        };
        Update: {
          user_id?: string;
          created_at?: string | null;
          last_seen?: string | null;
          subscription_tier?: string;
          subscription_status?: string;
          subscription_started_at?: string | null;
          subscription_current_period_end?: string | null;
          subscription_updated_at?: string | null;
          toss_customer_key?: string | null;
          toss_last_order_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};
