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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      address_book: {
        Row: {
          ansprechpartner: string
          created_at: string
          email: string | null
          firma_name: string | null
          id: string
          is_favorite: boolean
          notizen: string | null
          plz: string | null
          stadt: string | null
          strasse: string | null
          telefon: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ansprechpartner: string
          created_at?: string
          email?: string | null
          firma_name?: string | null
          id?: string
          is_favorite?: boolean
          notizen?: string | null
          plz?: string | null
          stadt?: string | null
          strasse?: string | null
          telefon?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ansprechpartner?: string
          created_at?: string
          email?: string | null
          firma_name?: string | null
          id?: string
          is_favorite?: boolean
          notizen?: string | null
          plz?: string | null
          stadt?: string | null
          strasse?: string | null
          telefon?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          created_at: string
          email: string | null
          fuehrerscheinklasse: string | null
          id: string
          name: string
          notizen: string | null
          status: Database["public"]["Enums"]["driver_status"]
          telefon: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          fuehrerscheinklasse?: string | null
          id?: string
          name: string
          notizen?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          telefon?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          fuehrerscheinklasse?: string | null
          id?: string
          name?: string
          notizen?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          telefon?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_schedule: {
        Row: {
          bezeichnung: string
          created_at: string
          erledigt_am: string | null
          faellig_am: string
          id: string
          kosten: number | null
          notizen: string | null
          status: Database["public"]["Enums"]["maintenance_status"]
          typ: Database["public"]["Enums"]["maintenance_type"]
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          bezeichnung: string
          created_at?: string
          erledigt_am?: string | null
          faellig_am: string
          id?: string
          kosten?: number | null
          notizen?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          typ: Database["public"]["Enums"]["maintenance_type"]
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          bezeichnung?: string
          created_at?: string
          erledigt_am?: string | null
          faellig_am?: string
          id?: string
          kosten?: number | null
          notizen?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          typ?: Database["public"]["Enums"]["maintenance_type"]
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_schedule_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          absender_adresse: string | null
          absender_name: string
          auftrags_nr: string
          created_at: string
          delivered_at: string | null
          empfaenger_adresse: string | null
          empfaenger_email: string | null
          empfaenger_name: string
          empfaenger_plz: string | null
          empfaenger_stadt: string
          empfaenger_telefon: string | null
          gewicht: number
          id: string
          notizen: string | null
          pakete: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          absender_adresse?: string | null
          absender_name: string
          auftrags_nr: string
          created_at?: string
          delivered_at?: string | null
          empfaenger_adresse?: string | null
          empfaenger_email?: string | null
          empfaenger_name: string
          empfaenger_plz?: string | null
          empfaenger_stadt: string
          empfaenger_telefon?: string | null
          gewicht?: number
          id?: string
          notizen?: string | null
          pakete?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          absender_adresse?: string | null
          absender_name?: string
          auftrags_nr?: string
          created_at?: string
          delivered_at?: string | null
          empfaenger_adresse?: string | null
          empfaenger_email?: string | null
          empfaenger_name?: string
          empfaenger_plz?: string | null
          empfaenger_stadt?: string
          empfaenger_telefon?: string | null
          gewicht?: number
          id?: string
          notizen?: string | null
          pakete?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ansprechpartner: string | null
          approved: boolean
          avatar_url: string | null
          created_at: string
          firma_name: string | null
          id: string
          land: string | null
          logo_url: string | null
          paketpreis: number | null
          plz: string | null
          stadt: string | null
          strasse: string | null
          telefon: string | null
          updated_at: string
          user_id: string
          ustid: string | null
          website: string | null
        }
        Insert: {
          ansprechpartner?: string | null
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          firma_name?: string | null
          id?: string
          land?: string | null
          logo_url?: string | null
          paketpreis?: number | null
          plz?: string | null
          stadt?: string | null
          strasse?: string | null
          telefon?: string | null
          updated_at?: string
          user_id: string
          ustid?: string | null
          website?: string | null
        }
        Update: {
          ansprechpartner?: string | null
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          firma_name?: string | null
          id?: string
          land?: string | null
          logo_url?: string | null
          paketpreis?: number | null
          plz?: string | null
          stadt?: string | null
          strasse?: string | null
          telefon?: string | null
          updated_at?: string
          user_id?: string
          ustid?: string | null
          website?: string | null
        }
        Relationships: []
      }
      routes: {
        Row: {
          created_at: string
          datum: string
          driver_id: string | null
          id: string
          name: string
          notizen: string | null
          status: Database["public"]["Enums"]["route_status"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          datum?: string
          driver_id?: string | null
          id?: string
          name: string
          notizen?: string | null
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          datum?: string
          driver_id?: string | null
          id?: string
          name?: string
          notizen?: string | null
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_connections: {
        Row: {
          active: boolean
          api_key: string
          api_url: string
          created_at: string
          id: string
          notizen: string | null
          platform: string
          updated_at: string
          user_id: string
          webhook_secret: string | null
        }
        Insert: {
          active?: boolean
          api_key?: string
          api_url?: string
          created_at?: string
          id?: string
          notizen?: string | null
          platform?: string
          updated_at?: string
          user_id: string
          webhook_secret?: string | null
        }
        Update: {
          active?: boolean
          api_key?: string
          api_url?: string
          created_at?: string
          id?: string
          notizen?: string | null
          platform?: string
          updated_at?: string
          user_id?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_inspections: {
        Row: {
          allgemein_notiz: string | null
          ausstattung_notiz: string | null
          ausstattung_ok: boolean
          bremsen_notiz: string | null
          bremsen_ok: boolean
          created_at: string
          id: string
          inspected_by: string
          inspection_date: string
          lichter_notiz: string | null
          lichter_ok: boolean
          reifen_notiz: string | null
          reifen_ok: boolean
          sauberkeit_notiz: string | null
          sauberkeit_ok: boolean
          spiegel_notiz: string | null
          spiegel_ok: boolean
          vehicle_id: string
        }
        Insert: {
          allgemein_notiz?: string | null
          ausstattung_notiz?: string | null
          ausstattung_ok?: boolean
          bremsen_notiz?: string | null
          bremsen_ok?: boolean
          created_at?: string
          id?: string
          inspected_by: string
          inspection_date?: string
          lichter_notiz?: string | null
          lichter_ok?: boolean
          reifen_notiz?: string | null
          reifen_ok?: boolean
          sauberkeit_notiz?: string | null
          sauberkeit_ok?: boolean
          spiegel_notiz?: string | null
          spiegel_ok?: boolean
          vehicle_id: string
        }
        Update: {
          allgemein_notiz?: string | null
          ausstattung_notiz?: string | null
          ausstattung_ok?: boolean
          bremsen_notiz?: string | null
          bremsen_ok?: boolean
          created_at?: string
          id?: string
          inspected_by?: string
          inspection_date?: string
          lichter_notiz?: string | null
          lichter_ok?: boolean
          reifen_notiz?: string | null
          reifen_ok?: boolean
          sauberkeit_notiz?: string | null
          sauberkeit_ok?: boolean
          spiegel_notiz?: string | null
          spiegel_ok?: boolean
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          id: string
          kapazitaet_kg: number
          kennzeichen: string
          notizen: string | null
          status: Database["public"]["Enums"]["vehicle_status"]
          typ: Database["public"]["Enums"]["vehicle_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kapazitaet_kg?: number
          kennzeichen: string
          notizen?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          typ?: Database["public"]["Enums"]["vehicle_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kapazitaet_kg?: number
          kennzeichen?: string
          notizen?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          typ?: Database["public"]["Enums"]["vehicle_type"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      driver_status: "aktiv" | "inaktiv"
      maintenance_status: "geplant" | "faellig" | "ueberfaellig" | "erledigt"
      maintenance_type:
        | "tuev"
        | "inspektion"
        | "reifenwechsel"
        | "oelwechsel"
        | "bremsen"
        | "batterie"
        | "sonstige"
      route_status: "geplant" | "aktiv" | "abgeschlossen"
      vehicle_status: "verfuegbar" | "unterwegs" | "in_wartung"
      vehicle_type: "lastenrad" | "e_van" | "transporter" | "sonstige"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
      driver_status: ["aktiv", "inaktiv"],
      maintenance_status: ["geplant", "faellig", "ueberfaellig", "erledigt"],
      maintenance_type: [
        "tuev",
        "inspektion",
        "reifenwechsel",
        "oelwechsel",
        "bremsen",
        "batterie",
        "sonstige",
      ],
      route_status: ["geplant", "aktiv", "abgeschlossen"],
      vehicle_status: ["verfuegbar", "unterwegs", "in_wartung"],
      vehicle_type: ["lastenrad", "e_van", "transporter", "sonstige"],
    },
  },
} as const
