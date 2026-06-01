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
      delivery_instructions: {
        Row: {
          created_at: string
          freetext: string | null
          id: string
          options: Json
          order_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          freetext?: string | null
          id?: string
          options?: Json
          order_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          freetext?: string | null
          id?: string
          options?: Json
          order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_instructions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zone_postcodes: {
        Row: {
          created_at: string
          id: string
          postcode: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          postcode: string
          zone_id: string
        }
        Update: {
          created_at?: string
          id?: string
          postcode?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zone_postcodes_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          description: string | null
          id: string
          label: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          label: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      depots: {
        Row: {
          active: boolean
          created_at: string
          geocoded_at: string | null
          id: string
          is_default: boolean
          land: string
          lat: number | null
          lng: number | null
          name: string
          notizen: string | null
          plz: string
          stadt: string
          strasse: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          geocoded_at?: string | null
          id?: string
          is_default?: boolean
          land?: string
          lat?: number | null
          lng?: number | null
          name: string
          notizen?: string | null
          plz: string
          stadt: string
          strasse: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          geocoded_at?: string | null
          id?: string
          is_default?: boolean
          land?: string
          lat?: number | null
          lng?: number | null
          name?: string
          notizen?: string | null
          plz?: string
          stadt?: string
          strasse?: string
          updated_at?: string
        }
        Relationships: []
      }
      dhl_price_tiers: {
        Row: {
          created_at: string
          id: string
          max_weight_kg: number
          price_netto: number
          product_code: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          max_weight_kg: number
          price_netto?: number
          product_code: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          max_weight_kg?: number
          price_netto?: number
          product_code?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dhl_price_tiers_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: false
            referencedRelation: "dhl_products"
            referencedColumns: ["code"]
          },
        ]
      }
      dhl_products: {
        Row: {
          active: boolean
          billing_number: string | null
          code: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_number?: string | null
          code: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_number?: string | null
          code?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      drivers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string | null
          fuehrerscheinklasse: string | null
          id: string
          last_login_at: string | null
          name: string
          notizen: string | null
          status: Database["public"]["Enums"]["driver_status"]
          telefon: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          fuehrerscheinklasse?: string | null
          id?: string
          last_login_at?: string | null
          name: string
          notizen?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          telefon?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          fuehrerscheinklasse?: string | null
          id?: string
          last_login_at?: string | null
          name?: string
          notizen?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          telefon?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_template_overrides: {
        Row: {
          created_at: string
          cta_label: string | null
          enabled: boolean
          footer: string | null
          greeting: string | null
          id: string
          intro: string | null
          outro: string | null
          preview: string | null
          subject: string | null
          template_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          enabled?: boolean
          footer?: string | null
          greeting?: string | null
          id?: string
          intro?: string | null
          outro?: string | null
          preview?: string | null
          subject?: string | null
          template_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          enabled?: boolean
          footer?: string | null
          greeting?: string | null
          id?: string
          intro?: string | null
          outro?: string | null
          preview?: string | null
          subject?: string | null
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
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
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience: string
          body: string
          created_at: string
          created_by: string | null
          id: string
          target_user_id: string | null
          title: string
        }
        Insert: {
          audience: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          target_user_id?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          target_user_id?: string | null
          title?: string
        }
        Relationships: []
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          order_id: string
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          order_id: string
          reason?: string | null
          status: string
          user_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          order_id?: string
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          delivery_attempts: number
          dhl_label_created_at: string | null
          dhl_label_url: string | null
          dhl_price_netto: number | null
          dhl_product_code: string | null
          dhl_shipment_no: string | null
          dhl_tracking_number: string | null
          empfaenger_adresse: string | null
          empfaenger_email: string | null
          empfaenger_name: string
          empfaenger_plz: string | null
          empfaenger_stadt: string
          empfaenger_telefon: string | null
          external_order_name: string | null
          external_order_ref: string | null
          geocoded_at: string | null
          gewicht: number
          id: string
          is_pickup: boolean
          lat: number | null
          lng: number | null
          notizen: string | null
          package_height_cm: number | null
          package_length_cm: number | null
          package_width_cm: number | null
          pakete: number
          shop_connection_id: string | null
          shopify_fulfilled_at: string | null
          shopify_fulfillment_id: string | null
          status: string
          tracking_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          absender_adresse?: string | null
          absender_name: string
          auftrags_nr: string
          created_at?: string
          delivered_at?: string | null
          delivery_attempts?: number
          dhl_label_created_at?: string | null
          dhl_label_url?: string | null
          dhl_price_netto?: number | null
          dhl_product_code?: string | null
          dhl_shipment_no?: string | null
          dhl_tracking_number?: string | null
          empfaenger_adresse?: string | null
          empfaenger_email?: string | null
          empfaenger_name: string
          empfaenger_plz?: string | null
          empfaenger_stadt: string
          empfaenger_telefon?: string | null
          external_order_name?: string | null
          external_order_ref?: string | null
          geocoded_at?: string | null
          gewicht?: number
          id?: string
          is_pickup?: boolean
          lat?: number | null
          lng?: number | null
          notizen?: string | null
          package_height_cm?: number | null
          package_length_cm?: number | null
          package_width_cm?: number | null
          pakete?: number
          shop_connection_id?: string | null
          shopify_fulfilled_at?: string | null
          shopify_fulfillment_id?: string | null
          status?: string
          tracking_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          absender_adresse?: string | null
          absender_name?: string
          auftrags_nr?: string
          created_at?: string
          delivered_at?: string | null
          delivery_attempts?: number
          dhl_label_created_at?: string | null
          dhl_label_url?: string | null
          dhl_price_netto?: number | null
          dhl_product_code?: string | null
          dhl_shipment_no?: string | null
          dhl_tracking_number?: string | null
          empfaenger_adresse?: string | null
          empfaenger_email?: string | null
          empfaenger_name?: string
          empfaenger_plz?: string | null
          empfaenger_stadt?: string
          empfaenger_telefon?: string | null
          external_order_name?: string | null
          external_order_ref?: string | null
          geocoded_at?: string | null
          gewicht?: number
          id?: string
          is_pickup?: boolean
          lat?: number | null
          lng?: number | null
          notizen?: string | null
          package_height_cm?: number | null
          package_length_cm?: number | null
          package_width_cm?: number | null
          pakete?: number
          shop_connection_id?: string | null
          shopify_fulfilled_at?: string | null
          shopify_fulfillment_id?: string | null
          status?: string
          tracking_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pickup_cron_settings: {
        Row: {
          deadline_hour: number
          deadline_minute: number
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          deadline_hour?: number
          deadline_minute?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          deadline_hour?: number
          deadline_minute?: number
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ansprechpartner: string | null
          approved: boolean
          avatar_url: string | null
          created_at: string
          dhl_enabled: boolean
          firma_name: string | null
          id: string
          land: string | null
          logo_url: string | null
          merchant_code: string | null
          opening_hours: Json
          paketpreis: number | null
          parent_user_id: string | null
          pickup_enabled: boolean
          pickup_time: string | null
          pickup_weekdays: number[]
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
          dhl_enabled?: boolean
          firma_name?: string | null
          id?: string
          land?: string | null
          logo_url?: string | null
          merchant_code?: string | null
          opening_hours?: Json
          paketpreis?: number | null
          parent_user_id?: string | null
          pickup_enabled?: boolean
          pickup_time?: string | null
          pickup_weekdays?: number[]
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
          dhl_enabled?: boolean
          firma_name?: string | null
          id?: string
          land?: string | null
          logo_url?: string | null
          merchant_code?: string | null
          opening_hours?: Json
          paketpreis?: number | null
          parent_user_id?: string | null
          pickup_enabled?: boolean
          pickup_time?: string | null
          pickup_weekdays?: number[]
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
      route_settings: {
        Row: {
          id: number
          stop_duration_minutes: number
          updated_at: string
        }
        Insert: {
          id?: number
          stop_duration_minutes?: number
          updated_at?: string
        }
        Update: {
          id?: number
          stop_duration_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      route_stops: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivery_mode: string | null
          delivery_note: string | null
          delivery_note_pdf_url: string | null
          delivery_photo_url: string | null
          delivery_recipient: string | null
          eta: string | null
          id: string
          leg_distance_m: number | null
          leg_duration_s: number | null
          notiz: string | null
          order_id: string
          pinned: boolean
          position: number
          route_id: string
          signature_url: string | null
          status: Database["public"]["Enums"]["route_stop_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivery_mode?: string | null
          delivery_note?: string | null
          delivery_note_pdf_url?: string | null
          delivery_photo_url?: string | null
          delivery_recipient?: string | null
          eta?: string | null
          id?: string
          leg_distance_m?: number | null
          leg_duration_s?: number | null
          notiz?: string | null
          order_id: string
          pinned?: boolean
          position?: number
          route_id: string
          signature_url?: string | null
          status?: Database["public"]["Enums"]["route_stop_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivery_mode?: string | null
          delivery_note?: string | null
          delivery_note_pdf_url?: string | null
          delivery_photo_url?: string | null
          delivery_recipient?: string | null
          eta?: string | null
          id?: string
          leg_distance_m?: number | null
          leg_duration_s?: number | null
          notiz?: string | null
          order_id?: string
          pinned?: boolean
          position?: number
          route_id?: string
          signature_url?: string | null
          status?: Database["public"]["Enums"]["route_stop_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_stops_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          datum: string
          driver_id: string | null
          end_depot_id: string | null
          geometry: Json | null
          id: string
          name: string
          notizen: string | null
          optimized_at: string | null
          start_depot_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["route_status"]
          total_distance_m: number | null
          total_duration_s: number | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          datum?: string
          driver_id?: string | null
          end_depot_id?: string | null
          geometry?: Json | null
          id?: string
          name: string
          notizen?: string | null
          optimized_at?: string | null
          start_depot_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_m?: number | null
          total_duration_s?: number | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          datum?: string
          driver_id?: string | null
          end_depot_id?: string | null
          geometry?: Json | null
          id?: string
          name?: string
          notizen?: string | null
          optimized_at?: string | null
          start_depot_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_m?: number | null
          total_duration_s?: number | null
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
            foreignKeyName: "routes_end_depot_id_fkey"
            columns: ["end_depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_start_depot_id_fkey"
            columns: ["start_depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
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
          auto_fulfill: boolean
          created_at: string
          id: string
          last_external_order_id: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          notizen: string | null
          platform: string
          shop_domain: string | null
          updated_at: string
          user_id: string
          webhook_secret: string | null
        }
        Insert: {
          active?: boolean
          api_key?: string
          api_url?: string
          auto_fulfill?: boolean
          created_at?: string
          id?: string
          last_external_order_id?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          notizen?: string | null
          platform?: string
          shop_domain?: string | null
          updated_at?: string
          user_id: string
          webhook_secret?: string | null
        }
        Update: {
          active?: boolean
          api_key?: string
          api_url?: string
          auto_fulfill?: boolean
          created_at?: string
          id?: string
          last_external_order_id?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          notizen?: string | null
          platform?: string
          shop_domain?: string | null
          updated_at?: string
          user_id?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      admin_get_pickup_cron_runs: {
        Args: { _limit?: number }
        Returns: {
          end_time: string
          jobid: number
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      admin_get_pickup_cron_status: {
        Args: never
        Returns: {
          active: boolean
          command: string
          jobid: number
          jobname: string
          schedule: string
        }[]
      }
      admin_get_shop_connection: {
        Args: { _user_id: string }
        Returns: {
          active: boolean
          api_key: string
          api_url: string
          auto_fulfill: boolean
          created_at: string
          id: string
          last_external_order_id: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          notizen: string | null
          platform: string
          shop_domain: string | null
          updated_at: string
          user_id: string
          webhook_secret: string | null
        }
        SetofOptions: {
          from: "*"
          to: "shop_connections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_merchant_code: {
        Args: { _merchant_code: string; _profile_id: string }
        Returns: string
      }
      admin_set_pickup_deadline: {
        Args: { _hour: number; _minute: number }
        Returns: {
          deadline_hour: number
          deadline_minute: number
          id: number
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "pickup_cron_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_order_status: {
        Args: { _order_id: string; _reason?: string; _status: string }
        Returns: {
          absender_adresse: string | null
          absender_name: string
          auftrags_nr: string
          created_at: string
          delivered_at: string | null
          delivery_attempts: number
          dhl_label_created_at: string | null
          dhl_label_url: string | null
          dhl_price_netto: number | null
          dhl_product_code: string | null
          dhl_shipment_no: string | null
          dhl_tracking_number: string | null
          empfaenger_adresse: string | null
          empfaenger_email: string | null
          empfaenger_name: string
          empfaenger_plz: string | null
          empfaenger_stadt: string
          empfaenger_telefon: string | null
          external_order_name: string | null
          external_order_ref: string | null
          geocoded_at: string | null
          gewicht: number
          id: string
          is_pickup: boolean
          lat: number | null
          lng: number | null
          notizen: string | null
          package_height_cm: number | null
          package_length_cm: number | null
          package_width_cm: number | null
          pakete: number
          shop_connection_id: string | null
          shopify_fulfilled_at: string | null
          shopify_fulfillment_id: string | null
          status: string
          tracking_token: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_driver_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      gdpr_cleanup_personal_data: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_depot_used_by_driver: { Args: { _depot_id: string }; Returns: boolean }
      is_order_in_driver_route: {
        Args: { _order_id: string }
        Returns: boolean
      }
      is_route_driver: { Args: { _route_id: string }; Returns: boolean }
      is_stop_route_driver: { Args: { _stop_id: string }; Returns: boolean }
      merchant_owner_id: { Args: { _uid: string }; Returns: string }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "driver"
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
      route_stop_status: "offen" | "erledigt" | "uebersprungen"
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
      app_role: ["admin", "moderator", "user", "driver"],
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
      route_stop_status: ["offen", "erledigt", "uebersprungen"],
      vehicle_status: ["verfuegbar", "unterwegs", "in_wartung"],
      vehicle_type: ["lastenrad", "e_van", "transporter", "sonstige"],
    },
  },
} as const
