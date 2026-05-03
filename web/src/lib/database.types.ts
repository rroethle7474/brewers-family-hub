export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      big_moments: {
        Row: {
          created_at: string
          description: string
          game_id: number
          id: string
          inning: number | null
          moment_type: string
          player_id: number | null
          wp_after: number | null
          wp_before: number | null
        }
        Insert: {
          created_at?: string
          description: string
          game_id: number
          id?: string
          inning?: number | null
          moment_type: string
          player_id?: number | null
          wp_after?: number | null
          wp_before?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          game_id?: number
          id?: string
          inning?: number | null
          moment_type?: string
          player_id?: number | null
          wp_after?: number | null
          wp_before?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "big_moments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          game_id: number | null
          id: string
          is_hot_take: boolean
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          game_id?: number | null
          id?: string
          is_hot_take?: boolean
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          game_id?: number | null
          id?: string
          is_hot_take?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          away_score: number | null
          away_team_id: number
          brewers_won: boolean | null
          game_date: string
          game_datetime: string
          home_score: number | null
          home_team_id: number
          id: number
          inning: number | null
          inning_state: string | null
          losing_pitcher_id: number | null
          probable_away_pitcher_id: number | null
          probable_home_pitcher_id: number | null
          status: string
          updated_at: string
          venue: string | null
          winning_pitcher_id: number | null
        }
        Insert: {
          away_score?: number | null
          away_team_id: number
          brewers_won?: boolean | null
          game_date: string
          game_datetime: string
          home_score?: number | null
          home_team_id: number
          id: number
          inning?: number | null
          inning_state?: string | null
          losing_pitcher_id?: number | null
          probable_away_pitcher_id?: number | null
          probable_home_pitcher_id?: number | null
          status: string
          updated_at?: string
          venue?: string | null
          winning_pitcher_id?: number | null
        }
        Update: {
          away_score?: number | null
          away_team_id?: number
          brewers_won?: boolean | null
          game_date?: string
          game_datetime?: string
          home_score?: number | null
          home_team_id?: number
          id?: number
          inning?: number | null
          inning_state?: string | null
          losing_pitcher_id?: number | null
          probable_away_pitcher_id?: number | null
          probable_home_pitcher_id?: number | null
          status?: string
          updated_at?: string
          venue?: string | null
          winning_pitcher_id?: number | null
        }
        Relationships: []
      }
      live_game_state: {
        Row: {
          away_score: number | null
          balls: number | null
          bases: Json | null
          current_batter_id: number | null
          current_pitcher_id: number | null
          game_id: number
          home_score: number | null
          inning: number | null
          inning_state: string | null
          outs: number | null
          recent_plays: Json | null
          strikes: number | null
          updated_at: string
          win_probability: number | null
        }
        Insert: {
          away_score?: number | null
          balls?: number | null
          bases?: Json | null
          current_batter_id?: number | null
          current_pitcher_id?: number | null
          game_id: number
          home_score?: number | null
          inning?: number | null
          inning_state?: string | null
          outs?: number | null
          recent_plays?: Json | null
          strikes?: number | null
          updated_at?: string
          win_probability?: number | null
        }
        Update: {
          away_score?: number | null
          balls?: number | null
          bases?: Json | null
          current_batter_id?: number | null
          current_pitcher_id?: number | null
          game_id?: number
          home_score?: number | null
          inning?: number | null
          inning_state?: string | null
          outs?: number | null
          recent_plays?: Json | null
          strikes?: number | null
          updated_at?: string
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_game_state_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          id: string
          predicted_wins: number
          submitted_at: string
          team_record_at_submission: string | null
          user_id: string
        }
        Insert: {
          id?: string
          predicted_wins: number
          submitted_at?: string
          team_record_at_submission?: string | null
          user_id: string
        }
        Update: {
          id?: string
          predicted_wins?: number
          submitted_at?: string
          team_record_at_submission?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          is_admin: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          is_admin?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      reactions: {
        Row: {
          comment_id: string
          created_at: string
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      standings_snapshot: {
        Row: {
          division_rank: number | null
          games_back: number | null
          last_10: string | null
          league_rank: number | null
          losses: number
          pct: number | null
          run_diff: number | null
          snapshot_date: string
          streak: string | null
          team_id: number
          wins: number
        }
        Insert: {
          division_rank?: number | null
          games_back?: number | null
          last_10?: string | null
          league_rank?: number | null
          losses: number
          pct?: number | null
          run_diff?: number | null
          snapshot_date: string
          streak?: string | null
          team_id: number
          wins: number
        }
        Update: {
          division_rank?: number | null
          games_back?: number | null
          last_10?: string | null
          league_rank?: number | null
          losses?: number
          pct?: number | null
          run_diff?: number | null
          snapshot_date?: string
          streak?: string | null
          team_id?: number
          wins?: number
        }
        Relationships: []
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
