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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
          safe_changes: Json
          source: string
          store_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
          safe_changes?: Json
          source?: string
          store_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
          safe_changes?: Json
          source?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_store_id_fkey"
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
          created_at: string
          description: string
          id: string
          image_path: string | null
          name: string
          position: number
          slug: string
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          name: string
          position?: number
          slug: string
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          name?: string
          position?: number
          slug?: string
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
      content_sections: {
        Row: {
          content: Json
          created_at: string
          ends_at: string | null
          id: string
          position: number
          section_key: string
          starts_at: string | null
          status: string
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          ends_at?: string | null
          id?: string
          position?: number
          section_key: string
          starts_at?: string | null
          status?: string
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          ends_at?: string | null
          id?: string
          position?: number
          section_key?: string
          starts_at?: string | null
          status?: string
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_sections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          customer_id: string | null
          discount_amount: number
          id: string
          order_id: string
          redemption_status: string
          redeemed_at: string
          store_id: string
        }
        Insert: {
          coupon_id: string
          customer_id?: string | null
          discount_amount: number
          id?: string
          order_id: string
          redemption_status?: string
          redeemed_at?: string
          store_id: string
        }
        Update: {
          coupon_id?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          order_id?: string
          redemption_status?: string
          redeemed_at?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_store_id_fkey"
            columns: ["coupon_id", "store_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_customer_id_store_id_fkey"
            columns: ["customer_id", "store_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          minimum_order_total: number
          per_customer_limit: number
          starts_at: string | null
          status: string
          store_id: string
          updated_at: string
          usage_limit: number | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          minimum_order_total?: number
          per_customer_limit?: number
          starts_at?: string | null
          status?: string
          store_id: string
          updated_at?: string
          usage_limit?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          minimum_order_total?: number
          per_customer_limit?: number
          starts_at?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          usage_limit?: number | null
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
      customers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string | null
          email_normalized: string | null
          full_name: string
          id: string
          marketing_consent_at: string | null
          marketing_consent_source: string | null
          phone: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          full_name: string
          id?: string
          marketing_consent_at?: string | null
          marketing_consent_source?: string | null
          phone?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          full_name?: string
          id?: string
          marketing_consent_at?: string | null
          marketing_consent_source?: string | null
          phone?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          effective_at: string
          id: string
          kind: string
          metadata: Json
          order_id: string
          payment_attempt_id: string | null
          provider: string
          provider_transaction_id: string | null
          store_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          effective_at?: string
          id?: string
          kind: string
          metadata?: Json
          order_id: string
          payment_attempt_id?: string | null
          provider: string
          provider_transaction_id?: string | null
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          effective_at?: string
          id?: string
          kind?: string
          metadata?: Json
          order_id?: string
          payment_attempt_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "financial_transactions_payment_attempt_id_store_id_fkey"
            columns: ["payment_attempt_id", "store_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      integration_configs: {
        Row: {
          created_at: string
          id: string
          last_checked_at: string | null
          provider: string
          safe_config: Json
          secret_reference: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_checked_at?: string | null
          provider: string
          safe_config?: Json
          secret_reference?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_checked_at?: string | null
          provider?: string
          safe_config?: Json
          secret_reference?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_levels: {
        Row: {
          available: number | null
          on_hand: number
          reorder_point: number
          reserved: number
          store_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          available?: number | null
          on_hand?: number
          reorder_point?: number
          reserved?: number
          store_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          available?: number | null
          on_hand?: number
          reorder_point?: number
          reserved?: number
          store_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_variant_id_store_id_fkey"
            columns: ["variant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          order_id: string
          quantity: number
          status: string
          store_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          order_id: string
          quantity: number
          status?: string
          store_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string
          quantity?: number
          status?: string
          store_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "inventory_reservations_variant_id_store_id_fkey"
            columns: ["variant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          image_path_snapshot: string | null
          line_total: number | null
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          sku_snapshot: string
          store_id: string
          unit_price: number
          variant_id: string | null
          variant_name_snapshot: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path_snapshot?: string | null
          line_total?: number | null
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity: number
          sku_snapshot: string
          store_id: string
          unit_price: number
          variant_id?: string | null
          variant_name_snapshot?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path_snapshot?: string | null
          line_total?: number | null
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          sku_snapshot?: string
          store_id?: string
          unit_price?: number
          variant_id?: string | null
          variant_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "order_items_product_id_store_id_fkey"
            columns: ["product_id", "store_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "order_items_variant_id_store_id_fkey"
            columns: ["variant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          order_id: string
          source: string
          store_id: string
          to_status: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id: string
          source: string
          store_id: string
          to_status: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          order_id?: string
          source?: string
          store_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json | null
          checkout_idempotency_key: string | null
          checkout_request_sha256: string | null
          coupon_code_snapshot: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_note: string | null
          customer_phone: string | null
          discount_total: number
          fulfillment_status: string
          fulfillment_carrier: string | null
          id: string
          internal_note: string | null
          is_portfolio_demo: boolean
          order_number: string
          payment_status: string
          placed_at: string
          shipping_address: Json
          shipping_method_snapshot: Json
          shipping_total: number
          shipped_at: string | null
          delivered_at: string | null
          tracking_code: string | null
          tracking_url: string | null
          status: string
          store_id: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          checkout_idempotency_key?: string | null
          checkout_request_sha256?: string | null
          coupon_code_snapshot?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_note?: string | null
          customer_phone?: string | null
          discount_total?: number
          fulfillment_status?: string
          fulfillment_carrier?: string | null
          id?: string
          internal_note?: string | null
          is_portfolio_demo?: boolean
          order_number: string
          payment_status?: string
          placed_at?: string
          shipping_address: Json
          shipping_method_snapshot?: Json
          shipping_total?: number
          shipped_at?: string | null
          delivered_at?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          status?: string
          store_id: string
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          checkout_idempotency_key?: string | null
          checkout_request_sha256?: string | null
          coupon_code_snapshot?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_note?: string | null
          customer_phone?: string | null
          discount_total?: number
          fulfillment_status?: string
          fulfillment_carrier?: string | null
          id?: string
          internal_note?: string | null
          is_portfolio_demo?: boolean
          order_number?: string
          payment_status?: string
          placed_at?: string
          shipping_address?: Json
          shipping_method_snapshot?: Json
          shipping_total?: number
          shipped_at?: string | null
          delivered_at?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_store_id_fkey"
            columns: ["customer_id", "store_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "store_id"]
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
      payment_attempts: {
        Row: {
          amount: number
          checkout_url: string | null
          checkout_lock_until: string | null
          created_at: string
          currency: string
          environment: string
          expires_at: string | null
          id: string
          idempotency_key: string
          method: string | null
          order_id: string
          paid_at: string | null
          provider: string
          provider_checkout_id: string | null
          provider_payment_id: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_url?: string | null
          checkout_lock_until?: string | null
          created_at?: string
          currency?: string
          environment?: string
          expires_at?: string | null
          id?: string
          idempotency_key: string
          method?: string | null
          order_id: string
          paid_at?: string | null
          provider: string
          provider_checkout_id?: string | null
          provider_payment_id?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_url?: string | null
          checkout_lock_until?: string | null
          created_at?: string
          currency?: string
          environment?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          method?: string | null
          order_id?: string
          paid_at?: string | null
          provider?: string
          provider_checkout_id?: string | null
          provider_payment_id?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string
          created_at: string
          id: string
          image_path: string
          is_primary: boolean
          position: number
          product_id: string
          store_id: string
          variant_id: string | null
        }
        Insert: {
          alt_text?: string
          created_at?: string
          id?: string
          image_path: string
          is_primary?: boolean
          position?: number
          product_id: string
          store_id: string
          variant_id?: string | null
        }
        Update: {
          alt_text?: string
          created_at?: string
          id?: string
          image_path?: string
          is_primary?: boolean
          position?: number
          product_id?: string
          store_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_store_id_fkey"
            columns: ["product_id", "store_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "product_media_variant_id_store_id_fkey"
            columns: ["variant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          created_at: string
          height_mm: number | null
          id: string
          image_path: string | null
          length_mm: number | null
          option_key: string
          option_label: string
          price_override: number | null
          product_id: string
          sku: string
          store_id: string
          swatch_hex: string | null
          updated_at: string
          weight_grams: number | null
          width_mm: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          height_mm?: number | null
          id?: string
          image_path?: string | null
          length_mm?: number | null
          option_key: string
          option_label: string
          price_override?: number | null
          product_id: string
          sku: string
          store_id: string
          swatch_hex?: string | null
          updated_at?: string
          weight_grams?: number | null
          width_mm?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          height_mm?: number | null
          id?: string
          image_path?: string | null
          length_mm?: number | null
          option_key?: string
          option_label?: string
          price_override?: number | null
          product_id?: string
          sku?: string
          store_id?: string
          swatch_hex?: string | null
          updated_at?: string
          weight_grams?: number | null
          width_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_store_id_fkey"
            columns: ["product_id", "store_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          box_contents: string
          category_id: string | null
          compatibility: string
          created_at: string
          description: string
          featured: boolean
          id: string
          name: string
          primary_image_path: string | null
          seo_description: string | null
          seo_title: string | null
          sku_base: string
          slug: string
          specifications: Json
          status: string
          store_id: string
          summary: string
          updated_at: string
        }
        Insert: {
          base_price: number
          box_contents?: string
          category_id?: string | null
          compatibility?: string
          created_at?: string
          description?: string
          featured?: boolean
          id?: string
          name: string
          primary_image_path?: string | null
          seo_description?: string | null
          seo_title?: string | null
          sku_base: string
          slug: string
          specifications?: Json
          status?: string
          store_id: string
          summary?: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          box_contents?: string
          category_id?: string | null
          compatibility?: string
          created_at?: string
          description?: string
          featured?: boolean
          id?: string
          name?: string
          primary_image_path?: string | null
          seo_description?: string | null
          seo_title?: string | null
          sku_base?: string
          slug?: string
          specifications?: Json
          status?: string
          store_id?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_store_id_fkey"
            columns: ["category_id", "store_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "store_id"]
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
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          store_id: string
          unit_cost: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number
          store_id: string
          unit_cost: number
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          store_id?: string
          unit_cost?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_store_id_fkey"
            columns: ["purchase_order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_store_id_fkey"
            columns: ["variant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          currency: string
          expected_at: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          purchase_number: string
          request_sha256: string | null
          received_at: string | null
          sent_at: string | null
          status: string
          store_id: string
          subtotal: number
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          expected_at?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          purchase_number: string
          request_sha256?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          store_id: string
          subtotal?: number
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          expected_at?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          purchase_number?: string
          request_sha256?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_store_id_fkey"
            columns: ["supplier_id", "store_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      service_case_events: {
        Row: {
          actor_user_id: string | null
          body: string
          case_id: string
          created_at: string
          event_type: string
          id: string
          safe_metadata: Json
          store_id: string
        }
        Insert: {
          actor_user_id?: string | null
          body?: string
          case_id: string
          created_at?: string
          event_type: string
          id?: string
          safe_metadata?: Json
          store_id: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string
          case_id?: string
          created_at?: string
          event_type?: string
          id?: string
          safe_metadata?: Json
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_case_events_case_id_store_id_fkey"
            columns: ["case_id", "store_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      service_cases: {
        Row: {
          assigned_to: string | null
          case_number: string
          case_type: string
          created_at: string
          customer_id: string | null
          id: string
          order_id: string | null
          priority: string
          reason: string
          resolution: string | null
          response_due_at: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_number: string
          case_type: string
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string | null
          priority?: string
          reason: string
          resolution?: string | null
          response_due_at?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_number?: string
          case_type?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string | null
          priority?: string
          reason?: string
          resolution?: string | null
          response_due_at?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_cases_customer_id_store_id_fkey"
            columns: ["customer_id", "store_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "service_cases_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "service_cases_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_events: {
        Row: {
          description: string
          event_code: string
          id: string
          occurred_at: string
          provider_event_id: string | null
          recorded_at: string
          shipment_id: string
          store_id: string
        }
        Insert: {
          description: string
          event_code: string
          id?: string
          occurred_at: string
          provider_event_id?: string | null
          recorded_at?: string
          shipment_id: string
          store_id: string
        }
        Update: {
          description?: string
          event_code?: string
          id?: string
          occurred_at?: string
          provider_event_id?: string | null
          recorded_at?: string
          shipment_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_store_id_fkey"
            columns: ["shipment_id", "store_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      shipments: {
        Row: {
          created_at: string
          estimated_delivery_at: string | null
          id: string
          label_storage_path: string | null
          last_synced_at: string | null
          order_id: string
          provider: string
          provider_shipment_id: string | null
          service_code: string | null
          service_name: string | null
          shipping_cost: number | null
          status: string
          store_id: string
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          estimated_delivery_at?: string | null
          id?: string
          label_storage_path?: string | null
          last_synced_at?: string | null
          order_id: string
          provider?: string
          provider_shipment_id?: string | null
          service_code?: string | null
          service_name?: string | null
          shipping_cost?: number | null
          status?: string
          store_id: string
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          estimated_delivery_at?: string | null
          id?: string
          label_storage_path?: string | null
          last_synced_at?: string | null
          order_id?: string
          provider?: string
          provider_shipment_id?: string | null
          service_code?: string | null
          service_name?: string | null
          shipping_cost?: number | null
          status?: string
          store_id?: string
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          movement_type: string
          order_id: string | null
          purchase_order_id: string | null
          quantity_delta: number
          reason: string
          store_id: string
          variant_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          movement_type: string
          order_id?: string | null
          purchase_order_id?: string | null
          quantity_delta: number
          reason: string
          store_id: string
          variant_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          movement_type?: string
          order_id?: string | null
          purchase_order_id?: string | null
          quantity_delta?: number
          reason?: string
          store_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_id_store_id_fkey"
            columns: ["order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "stock_movements_purchase_order_fk"
            columns: ["purchase_order_id", "store_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_store_id_fkey"
            columns: ["variant_id", "store_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "store_id"]
          },
        ]
      }
      store_memberships: {
        Row: {
          created_at: string
          email_snapshot: string | null
          id: string
          invited_at: string | null
          joined_at: string | null
          role: string
          status: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_snapshot?: string | null
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role: string
          status?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_snapshot?: string | null
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_memberships_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json
          store_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value?: Json
          store_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json
          store_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          slug: string
          status: string
          support_email: string | null
          support_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          slug: string
          status?: string
          support_email?: string | null
          support_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          slug?: string
          status?: string
          support_email?: string | null
          support_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          lead_time_days: number | null
          name: string
          phone: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_time_days?: number | null
          name: string
          phone?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_time_days?: number | null
          name?: string
          phone?: string | null
          status?: string
          store_id?: string
          updated_at?: string
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
      webhook_inbox: {
        Row: {
          attempt_count: number
          event_type: string
          id: string
          last_error_code: string | null
          payload_sha256: string
          processed_at: string | null
          processing_status: string
          provider: string
          provider_event_id: string
          received_at: string
          safe_metadata: Json
          signature_valid: boolean
          store_id: string
        }
        Insert: {
          attempt_count?: number
          event_type: string
          id?: string
          last_error_code?: string | null
          payload_sha256: string
          processed_at?: string | null
          processing_status?: string
          provider: string
          provider_event_id: string
          received_at?: string
          safe_metadata?: Json
          signature_valid: boolean
          store_id: string
        }
        Update: {
          attempt_count?: number
          event_type?: string
          id?: string
          last_error_code?: string | null
          payload_sha256?: string
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_event_id?: string
          received_at?: string
          safe_metadata?: Json
          signature_valid?: boolean
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_inbox_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_variant_stock: {
        Args: {
          p_delta: number
          p_idempotency_key: string
          p_reason: string
          p_store_id: string
          p_variant_id: string
        }
        Returns: {
          available: number
          movement_id: string
          on_hand: number
          reserved: number
        }[]
      }
      create_storefront_order: {
        Args: {
          p_customer_email: string | null
          p_customer_name: string
          p_customer_phone: string | null
          p_idempotency_key: string
          p_items: Json
          p_request_sha256: string
          p_shipping_address: Json
          p_shipping_method_snapshot: Json
          p_shipping_total: number
          p_store_id: string
        }
        Returns: {
          is_idempotent_replay: boolean
          result_order_id: string
          result_order_number: string
          result_total: number
        }[]
      }
      create_portfolio_demo_order: {
        Args: {
          p_cart_sha256: string
          p_coupon_code?: string | null
          p_customer_email: string
          p_customer_name: string
          p_customer_note?: string | null
          p_customer_phone: string | null
          p_idempotency_key: string
          p_items: Json
          p_request_sha256: string
          p_shipping_address: Json
          p_shipping_quote_id: string
          p_store_id: string
        }
        Returns: {
          is_idempotent_replay: boolean
          result_coupon_code: string | null
          result_discount_total: number
          result_order_id: string
          result_order_number: string
          result_shipping_total: number
          result_subtotal: number
          result_total: number
        }[]
      }
      claim_portfolio_pagbank_checkout: {
        Args: { p_order_id: string }
        Returns: {
          result_action: string
          result_checkout_url: string | null
          result_payment_attempt_id: string | null
          result_provider_checkout_id: string | null
        }[]
      }
      complete_portfolio_pagbank_checkout: {
        Args: { p_expires_at?: string | null; p_payment_attempt_id: string; p_provider_checkout_id: string; p_checkout_url: string }
        Returns: boolean
      }
      release_portfolio_pagbank_checkout: {
        Args: { p_payment_attempt_id: string }
        Returns: boolean
      }
      transition_storefront_order: {
        Args: { p_action: string; p_carrier?: string | null; p_note?: string | null; p_order_id: string; p_tracking_code?: string | null; p_tracking_url?: string | null }
        Returns: { result_fulfillment_status: string; result_status: string }[]
      }
      set_admin_product_status: {
        Args: { p_product_id: string; p_status: string }
        Returns: string
      }
      transition_admin_purchase_order: {
        Args: { p_action: string; p_purchase_order_id: string }
        Returns: string
      }
      update_storefront_tracking: {
        Args: { p_carrier: string; p_note?: string | null; p_order_id: string; p_tracking_code?: string | null; p_tracking_url?: string | null }
        Returns: boolean
      }
      create_admin_service_case: {
        Args: { p_case_type: string; p_order_id: string | null; p_priority: string; p_reason: string; p_store_id: string }
        Returns: { result_case_id: string; result_case_number: string }[]
      }
      transition_admin_service_case: {
        Args: { p_case_id: string; p_note?: string | null; p_resolution?: string | null; p_status: string }
        Returns: string
      }
      create_admin_purchase_order: {
        Args: { p_expected_at: string | null; p_idempotency_key: string; p_items: Json; p_notes: string | null; p_request_sha256: string; p_store_id: string; p_supplier_id: string }
        Returns: { is_idempotent_replay: boolean; result_purchase_number: string; result_purchase_order_id: string }[]
      }
      receive_admin_purchase_order: {
        Args: { p_idempotency_key: string; p_items: Json; p_purchase_order_id: string }
        Returns: { is_idempotent_replay: boolean; result_batch_id: string; result_status: string }[]
      }
      release_expired_storefront_reservations: {
        Args: {
          p_limit?: number
        }
        Returns: number
      }
      create_product_variant: {
        Args: {
          p_height_mm?: number | null
          p_image_path?: string | null
          p_length_mm?: number | null
          p_option_key: string
          p_option_label: string
          p_price_override?: number | null
          p_product_id: string
          p_reorder_point?: number
          p_sku: string
          p_store_id: string
          p_swatch_hex?: string | null
          p_weight_grams?: number | null
          p_width_mm?: number | null
        }
        Returns: string
      }
      update_product_variant: {
        Args: {
          p_height_mm: number | null
          p_image_path: string | null
          p_length_mm: number | null
          p_option_label: string
          p_price_override: number | null
          p_reorder_point: number
          p_store_id: string
          p_swatch_hex: string | null
          p_variant_id: string
          p_weight_grams: number | null
          p_width_mm: number | null
        }
        Returns: string
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

