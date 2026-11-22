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
      add_ons: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          id: string
          image_url: string
          name: string
          price: number
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          name: string
          price?: number
          store_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          name?: string
          price?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "add_ons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      addon_images: {
        Row: {
          addon_id: string
          created_at: string
          display_order: number
          id: string
          image_url: string
        }
        Insert: {
          addon_id: string
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
        }
        Update: {
          addon_id?: string
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "addon_images_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "add_ons"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          actor_role: string | null
          actor_user_id: string | null
          amount_delta: number
          created_at: string
          currency: string
          event_type: string
          feature_key: string | null
          id: string
          metadata: Json
          provider: string | null
          provider_ref: string | null
          store_id: string
          total_after: number | null
        }
        Insert: {
          actor_role?: string | null
          actor_user_id?: string | null
          amount_delta?: number
          created_at?: string
          currency?: string
          event_type: string
          feature_key?: string | null
          id?: string
          metadata?: Json
          provider?: string | null
          provider_ref?: string | null
          store_id: string
          total_after?: number | null
        }
        Update: {
          actor_role?: string | null
          actor_user_id?: string | null
          amount_delta?: number
          created_at?: string
          currency?: string
          event_type?: string
          feature_key?: string | null
          id?: string
          metadata?: Json
          provider?: string | null
          provider_ref?: string | null
          store_id?: string
          total_after?: number | null
        }
        Relationships: []
      }
      billing_idempotency: {
        Row: {
          created_at: string
          expires_at: string
          key: string
          result: Json
          store_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          key: string
          result?: Json
          store_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          key?: string
          result?: Json
          store_id?: string
        }
        Relationships: []
      }
      billing_tokens: {
        Row: {
          created_at: string
          customer_token: string
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean
          last4: string
          payment_method_brand: string
          provider: string
          store_id: string
        }
        Insert: {
          created_at?: string
          customer_token: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string
          payment_method_brand?: string
          provider: string
          store_id: string
        }
        Update: {
          created_at?: string
          customer_token?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean
          last4?: string
          payment_method_brand?: string
          provider?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_tokens_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience: string
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          scheduled_for: string | null
          sent_count: number
          status: string
          store_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          scheduled_for?: string | null
          sent_count?: number
          status?: string
          store_id?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          scheduled_for?: string | null
          sent_count?: number
          status?: string
          store_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          bg_color: string
          bg_color_to: string
          bg_effect: string
          bg_image_url: string
          bg_position: string
          bg_shape: string
          bg_size: number
          created_at: string
          display_mode: string
          display_order: number
          id: string
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          bg_color?: string
          bg_color_to?: string
          bg_effect?: string
          bg_image_url?: string
          bg_position?: string
          bg_shape?: string
          bg_size?: number
          created_at?: string
          display_mode?: string
          display_order?: number
          id?: string
          name: string
          store_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          bg_color?: string
          bg_color_to?: string
          bg_effect?: string
          bg_image_url?: string
          bg_position?: string
          bg_shape?: string
          bg_size?: number
          created_at?: string
          display_mode?: string
          display_order?: number
          id?: string
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usages: {
        Row: {
          coupon_id: string
          discount_amount: number
          id: string
          order_id: string | null
          store_id: string
          used_at: string
          user_email: string | null
        }
        Insert: {
          coupon_id: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          store_id?: string
          used_at?: string
          user_email?: string | null
        }
        Update: {
          coupon_id?: string
          discount_amount?: number
          id?: string
          order_id?: string | null
          store_id?: string
          used_at?: string
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          max_uses: number | null
          min_order: number
          starts_at: string | null
          store_id: string
          updated_at: string
          used_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          max_uses?: number | null
          min_order?: number
          starts_at?: string | null
          store_id?: string
          updated_at?: string
          used_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          max_uses?: number | null
          min_order?: number
          starts_at?: string | null
          store_id?: string
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_locations: {
        Row: {
          courier_id: string
          heading: number | null
          id: string
          lat: number
          lng: number
          order_id: string | null
          recorded_at: string
          speed: number | null
        }
        Insert: {
          courier_id: string
          heading?: number | null
          id?: string
          lat: number
          lng: number
          order_id?: string | null
          recorded_at?: string
          speed?: number | null
        }
        Update: {
          courier_id?: string
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          order_id?: string | null
          recorded_at?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_locations_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name: string
          phone?: string
          store_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "couriers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          items: Json
          needed_by: string | null
          notes: string | null
          received_at: string | null
          sent_at: string | null
          status: string
          store_id: string
          supplier_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          needed_by?: string | null
          notes?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          store_id: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          needed_by?: string | null
          notes?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          store_id?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          category: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          order_days: string[]
          phone: string | null
          store_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          category?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          order_days?: string[]
          phone?: string | null
          store_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          order_days?: string[]
          phone?: string | null
          store_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          store_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          store_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      hero_slides: {
        Row: {
          active: boolean
          autoplay_seconds: number
          bg_color: string
          coupon_code: string
          created_at: string
          cta_label: string
          cta_url: string
          display_order: number
          ends_at: string | null
          id: string
          media_type: string
          media_url: string
          starts_at: string | null
          store_id: string
          subtitle: string
          text_color: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          autoplay_seconds?: number
          bg_color?: string
          coupon_code?: string
          created_at?: string
          cta_label?: string
          cta_url?: string
          display_order?: number
          ends_at?: string | null
          id?: string
          media_type?: string
          media_url?: string
          starts_at?: string | null
          store_id?: string
          subtitle?: string
          text_color?: string
          title?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          autoplay_seconds?: number
          bg_color?: string
          coupon_code?: string
          created_at?: string
          cta_label?: string
          cta_url?: string
          display_order?: number
          ends_at?: string | null
          id?: string
          media_type?: string
          media_url?: string
          starts_at?: string | null
          store_id?: string
          subtitle?: string
          text_color?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hero_slides_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scans: {
        Row: {
          business_name: string | null
          created_at: string
          discovered_addons: Json
          discovered_business_name: string | null
          discovered_categories: Json
          discovered_logo_url: string | null
          discovered_meta: Json
          discovered_palette: Json
          discovered_phone: string | null
          discovered_products: Json
          discovered_sites: Json
          discovered_working_hours: Json
          id: string
          otp_code_hash: string | null
          otp_expires_at: string | null
          requested_phone: string | null
          scan_token: string
          source_url: string
          status: string
          store_id: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          discovered_addons?: Json
          discovered_business_name?: string | null
          discovered_categories?: Json
          discovered_logo_url?: string | null
          discovered_meta?: Json
          discovered_palette?: Json
          discovered_phone?: string | null
          discovered_products?: Json
          discovered_sites?: Json
          discovered_working_hours?: Json
          id?: string
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          requested_phone?: string | null
          scan_token: string
          source_url: string
          status?: string
          store_id?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string
          discovered_addons?: Json
          discovered_business_name?: string | null
          discovered_categories?: Json
          discovered_logo_url?: string | null
          discovered_meta?: Json
          discovered_palette?: Json
          discovered_phone?: string | null
          discovered_products?: Json
          discovered_sites?: Json
          discovered_working_hours?: Json
          id?: string
          otp_code_hash?: string | null
          otp_expires_at?: string | null
          requested_phone?: string | null
          scan_token?: string
          source_url?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_scans_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          created_at: string
          id: string
          intro: string
          sections: Json
          slug: string
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          intro?: string
          sections?: Json
          slug: string
          store_id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          intro?: string
          sections?: Json
          slug?: string
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_documents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          card_text: string | null
          created_at: string
          extras: Json
          id: string
          order_id: string
          product_id: string | null
          product_image: string
          product_name: string
          quantity: number
          unit_price: number
        }
        Insert: {
          card_text?: string | null
          created_at?: string
          extras?: Json
          id?: string
          order_id: string
          product_id?: string | null
          product_image?: string
          product_name: string
          quantity?: number
          unit_price: number
        }
        Update: {
          card_text?: string | null
          created_at?: string
          extras?: Json
          id?: string
          order_id?: string
          product_id?: string | null
          product_image?: string
          product_name?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
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
          coupon_code: string | null
          courier_id: string | null
          created_at: string
          created_by_admin: boolean
          customer_email: string | null
          customer_name: string
          customer_phone: string
          deleted_at: string | null
          delivery_address: string
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_notes: string | null
          discount: number
          id: string
          meshulam_transaction_id: string | null
          order_number: string
          payment_method: string
          payment_status: string
          scheduled_for: string | null
          sent_to_whatsapp_at: string | null
          shipping: number
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subtotal: number
          terms_accepted_at: string | null
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          coupon_code?: string | null
          courier_id?: string | null
          created_at?: string
          created_by_admin?: boolean
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          deleted_at?: string | null
          delivery_address: string
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_notes?: string | null
          discount?: number
          id?: string
          meshulam_transaction_id?: string | null
          order_number?: string
          payment_method?: string
          payment_status?: string
          scheduled_for?: string | null
          sent_to_whatsapp_at?: string | null
          shipping?: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal?: number
          terms_accepted_at?: string | null
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          coupon_code?: string | null
          courier_id?: string | null
          created_at?: string
          created_by_admin?: boolean
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          deleted_at?: string | null
          delivery_address?: string
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_notes?: string | null
          discount?: number
          id?: string
          meshulam_transaction_id?: string | null
          order_number?: string
          payment_method?: string
          payment_status?: string
          scheduled_for?: string | null
          sent_to_whatsapp_at?: string | null
          shipping?: number
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subtotal?: number
          terms_accepted_at?: string | null
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          active: boolean
          category: string
          created_at: string
          currency: string
          description: string
          display_order: number
          id: string
          key: string
          monthly_price: number
          name: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          currency?: string
          description?: string
          display_order?: number
          id?: string
          key: string
          monthly_price?: number
          name: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          currency?: string
          description?: string
          display_order?: number
          id?: string
          key?: string
          monthly_price?: number
          name?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      plan_quotas: {
        Row: {
          created_at: string
          id: string
          monthly_limit: number
          period: string
          plan_key: string
          quota_key: string
          trial_percent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_limit?: number
          period?: string
          plan_key: string
          quota_key: string
          trial_percent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_limit?: number
          period?: string
          plan_key?: string
          quota_key?: string
          trial_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_content: {
        Row: {
          data: Json
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data?: Json
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      popup_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          marketing_opt_in: boolean
          name: string | null
          phone: string | null
          source_popup_id: string | null
          store_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          marketing_opt_in?: boolean
          name?: string | null
          phone?: string | null
          source_popup_id?: string | null
          store_id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          marketing_opt_in?: boolean
          name?: string | null
          phone?: string | null
          source_popup_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "popup_subscribers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          active: boolean
          adjustment_type: string
          adjustment_value: number
          created_at: string
          ends_at: string | null
          id: string
          name: string
          priority: number
          scope: string
          scope_id: string | null
          starts_at: string | null
          store_id: string
          updated_at: string
          weekdays: number[] | null
        }
        Insert: {
          active?: boolean
          adjustment_type?: string
          adjustment_value?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          name: string
          priority?: number
          scope?: string
          scope_id?: string | null
          starts_at?: string | null
          store_id?: string
          updated_at?: string
          weekdays?: number[] | null
        }
        Update: {
          active?: boolean
          adjustment_type?: string
          adjustment_value?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string
          priority?: number
          scope?: string
          scope_id?: string | null
          starts_at?: string | null
          store_id?: string
          updated_at?: string
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          product_id: string
        }
        Insert: {
          category_id: string
          product_id: string
        }
        Update: {
          category_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          product_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          product_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sizes: {
        Row: {
          created_at: string
          display_order: number
          id: string
          label: string
          original_price: number | null
          price: number
          product_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          label: string
          original_price?: number | null
          price?: number
          product_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          label?: string
          original_price?: number | null
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_sizes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          badge: string | null
          badge_color: string | null
          category_id: string | null
          created_at: string
          description: string
          display_order: number
          highlight_size: number
          id: string
          image_url: string
          name: string
          original_price: number | null
          price: number
          rating: number
          stock: number
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string | null
          badge_color?: string | null
          category_id?: string | null
          created_at?: string
          description?: string
          display_order?: number
          highlight_size?: number
          id?: string
          image_url?: string
          name: string
          original_price?: number | null
          price?: number
          rating?: number
          stock?: number
          store_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string | null
          badge_color?: string | null
          category_id?: string | null
          created_at?: string
          description?: string
          display_order?: number
          highlight_size?: number
          id?: string
          image_url?: string
          name?: string
          original_price?: number | null
          price?: number
          rating?: number
          stock?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      site_popups: {
        Row: {
          action_type: string
          active: boolean
          animation: string
          auto_close_seconds: number | null
          bg_color: string
          bg_opacity: number
          bg_video_url: string
          body: string
          content_padding: number
          created_at: string
          cta_label: string | null
          cta_url: string | null
          display_order: number
          ends_at: string | null
          filter_product_ids: string[] | null
          id: string
          image_url: string | null
          layout: string
          overlay_opacity: number
          position: string
          rotate_seconds: number | null
          shape: string
          size: string
          starts_at: string | null
          store_id: string
          text_align: string
          text_color: string
          title: string
          trigger_category_ids: string[]
          trigger_type: string
          trigger_value: string
          updated_at: string
        }
        Insert: {
          action_type?: string
          active?: boolean
          animation?: string
          auto_close_seconds?: number | null
          bg_color?: string
          bg_opacity?: number
          bg_video_url?: string
          body?: string
          content_padding?: number
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          display_order?: number
          ends_at?: string | null
          filter_product_ids?: string[] | null
          id?: string
          image_url?: string | null
          layout?: string
          overlay_opacity?: number
          position?: string
          rotate_seconds?: number | null
          shape?: string
          size?: string
          starts_at?: string | null
          store_id?: string
          text_align?: string
          text_color?: string
          title?: string
          trigger_category_ids?: string[]
          trigger_type?: string
          trigger_value?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          active?: boolean
          animation?: string
          auto_close_seconds?: number | null
          bg_color?: string
          bg_opacity?: number
          bg_video_url?: string
          body?: string
          content_padding?: number
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          display_order?: number
          ends_at?: string | null
          filter_product_ids?: string[] | null
          id?: string
          image_url?: string | null
          layout?: string
          overlay_opacity?: number
          position?: string
          rotate_seconds?: number | null
          shape?: string
          size?: string
          starts_at?: string | null
          store_id?: string
          text_align?: string
          text_color?: string
          title?: string
          trigger_category_ids?: string[]
          trigger_type?: string
          trigger_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_popups_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          store_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          store_id?: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          store_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_features: {
        Row: {
          enabled: boolean
          enabled_at: string
          expires_at: string | null
          feature_key: string
          id: string
          notes: string
          store_id: string
        }
        Insert: {
          enabled?: boolean
          enabled_at?: string
          expires_at?: string | null
          feature_key: string
          id?: string
          notes?: string
          store_id: string
        }
        Update: {
          enabled?: boolean
          enabled_at?: string
          expires_at?: string | null
          feature_key?: string
          id?: string
          notes?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_features_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_members: {
        Row: {
          created_at: string
          id: string
          role: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          is_trial: boolean
          payment_method_attached: boolean
          plan_key: string
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          store_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          is_trial?: boolean
          payment_method_attached?: boolean
          plan_key?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          store_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          is_trial?: boolean
          payment_method_attached?: boolean
          plan_key?: string
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          store_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_usage: {
        Row: {
          period_start: string
          quota_key: string
          store_id: string
          updated_at: string
          used: number
        }
        Insert: {
          period_start: string
          quota_key: string
          store_id: string
          updated_at?: string
          used?: number
        }
        Update: {
          period_start?: string
          quota_key?: string
          store_id?: string
          updated_at?: string
          used?: number
        }
        Relationships: []
      }
      stores: {
        Row: {
          active: boolean
          contact_email: string
          contact_phone: string
          created_at: string
          description: string
          extra_domains: string[]
          favicon_url: string
          id: string
          logo_url: string
          name: string
          owner_user_id: string | null
          plan: string
          primary_domain: string | null
          slug: string
          theme: Json
          updated_at: string
          whatsapp_business: string
          working_hours: Json
        }
        Insert: {
          active?: boolean
          contact_email?: string
          contact_phone?: string
          created_at?: string
          description?: string
          extra_domains?: string[]
          favicon_url?: string
          id?: string
          logo_url?: string
          name: string
          owner_user_id?: string | null
          plan?: string
          primary_domain?: string | null
          slug: string
          theme?: Json
          updated_at?: string
          whatsapp_business?: string
          working_hours?: Json
        }
        Update: {
          active?: boolean
          contact_email?: string
          contact_phone?: string
          created_at?: string
          description?: string
          extra_domains?: string[]
          favicon_url?: string
          id?: string
          logo_url?: string
          name?: string
          owner_user_id?: string | null
          plan?: string
          primary_domain?: string | null
          slug?: string
          theme?: Json
          updated_at?: string
          whatsapp_business?: string
          working_hours?: Json
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          certified: boolean
          certified_at: string | null
          created_at: string
          display_name: string | null
          notes: string | null
          phone: string | null
          tag_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          certified?: boolean
          certified_at?: string | null
          created_at?: string
          display_name?: string | null
          notes?: string | null
          phone?: string | null
          tag_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          certified?: boolean
          certified_at?: string | null
          created_at?: string
          display_name?: string | null
          notes?: string | null
          phone?: string | null
          tag_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "customer_tags"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_users: {
        Args: never
        Returns: {
          certified: boolean
          created_at: string
          display_name: string
          email: string
          phone: string
          roles: string[]
          tag_color: string
          tag_id: string
          tag_name: string
          user_id: string
        }[]
      }
      current_store_id: { Args: never; Returns: string }
      default_store_id: { Args: never; Returns: string }
      get_scan_by_token: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          discovered_addons: Json
          discovered_business_name: string
          discovered_categories: Json
          discovered_logo_url: string
          discovered_palette: Json
          discovered_phone: string
          discovered_products: Json
          discovered_sites: Json
          discovered_working_hours: Json
          id: string
          scan_token: string
          source_url: string
          status: string
          store_id: string
          updated_at: string
          verified_at: string
        }[]
      }
      get_store_admin: {
        Args: { _store_id: string }
        Returns: {
          active: boolean
          contact_email: string
          contact_phone: string
          created_at: string
          description: string
          extra_domains: string[]
          favicon_url: string
          id: string
          logo_url: string
          name: string
          owner_user_id: string | null
          plan: string
          primary_domain: string | null
          slug: string
          theme: Json
          updated_at: string
          whatsapp_business: string
          working_hours: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_id_by_email: { Args: { _email: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_store_usage: {
        Args: { _n?: number; _quota_key: string; _store_id: string }
        Returns: number
      }
      is_courier_for_order: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      is_store_manager: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      is_store_member: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      platform_template_store_id: { Args: never; Returns: string }
      record_coupon_usage: {
        Args: {
          _coupon_id: string
          _discount_amount: number
          _order_id: string
          _user_email: string
        }
        Returns: string
      }
      top_products: {
        Args: { _days?: number; _limit?: number }
        Returns: {
          product_id: string
          product_image: string
          product_name: string
          total_qty: number
          total_revenue: number
        }[]
      }
      user_courier_id: { Args: { _user_id: string }; Returns: string }
      user_has_any_store: { Args: { _user_id: string }; Returns: boolean }
      validate_coupon: {
        Args: { _code: string; _subtotal: number }
        Returns: {
          coupon_id: string
          discount: number
          message: string
          valid: boolean
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "courier" | "customer" | "store_owner"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
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
      app_role: ["admin", "courier", "customer", "store_owner"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const

