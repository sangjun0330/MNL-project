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
