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
      wnl_daily_logs: {
        Row: {
          device_id: string;
          date_iso: string;
          payload: Json;
          client_updated_at: number | null;
          updated_at: string | null;
        };
        Insert: {
          device_id: string;
          date_iso: string;
          payload: Json;
          client_updated_at?: number | null;
          updated_at?: string | null;
        };
        Update: {
          device_id?: string;
          date_iso?: string;
          payload?: Json;
          client_updated_at?: number | null;
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
        };
        Insert: {
          user_id: string;
          created_at?: string | null;
          last_seen?: string | null;
        };
        Update: {
          user_id?: string;
          created_at?: string | null;
          last_seen?: string | null;
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
