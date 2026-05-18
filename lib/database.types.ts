export type UserRole = 'customer' | 'runner' | 'admin';
export type JobStatus = 'pending' | 'accepted' | 'picked_up' | 'dropped_off' | 'complete' | 'cancelled';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          role: UserRole;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          pickup_address: string | null;
          pickup_lat: number | null;
          pickup_lng: number | null;
          stripe_customer_id: string | null;
          stripe_account_id: string | null;
          amazon_connected: boolean;
          walmart_connected: boolean;
          target_connected: boolean;
          rating_avg: number;
          rating_count: number;
          is_verified: boolean;
          is_online: boolean;
          current_lat: number | null;
          current_lng: number | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          stripe_customer_id?: string | null;
          stripe_account_id?: string | null;
          amazon_connected?: boolean;
          walmart_connected?: boolean;
          target_connected?: boolean;
          rating_avg?: number;
          rating_count?: number;
          is_verified?: boolean;
          is_online?: boolean;
          current_lat?: number | null;
          current_lng?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          stripe_customer_id?: string | null;
          stripe_account_id?: string | null;
          amazon_connected?: boolean;
          walmart_connected?: boolean;
          target_connected?: boolean;
          rating_avg?: number;
          rating_count?: number;
          is_verified?: boolean;
          is_online?: boolean;
          current_lat?: number | null;
          current_lng?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          customer_id: string;
          runner_id: string | null;
          status: JobStatus;
          retailer: string | null;
          package_count: number | null;
          dropoff_type: string | null;
          pickup_address: string | null;
          pickup_lat: number | null;
          pickup_lng: number | null;
          dropoff_name: string | null;
          dropoff_lat: number | null;
          dropoff_lng: number | null;
          distance_miles: number | null;
          base_fare: number | null;
          platform_cut: number | null;
          runner_payout: number | null;
          tip_amount: number;
          stripe_payment_intent_id: string | null;
          accepted_at: string | null;
          picked_up_at: string | null;
          dropped_off_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          runner_id?: string | null;
          status?: JobStatus;
          retailer?: string | null;
          package_count?: number | null;
          dropoff_type?: string | null;
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          dropoff_name?: string | null;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          distance_miles?: number | null;
          base_fare?: number | null;
          platform_cut?: number | null;
          runner_payout?: number | null;
          tip_amount?: number;
          stripe_payment_intent_id?: string | null;
          accepted_at?: string | null;
          picked_up_at?: string | null;
          dropped_off_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          runner_id?: string | null;
          status?: JobStatus;
          retailer?: string | null;
          package_count?: number | null;
          dropoff_type?: string | null;
          pickup_address?: string | null;
          pickup_lat?: number | null;
          pickup_lng?: number | null;
          dropoff_name?: string | null;
          dropoff_lat?: number | null;
          dropoff_lng?: number | null;
          distance_miles?: number | null;
          base_fare?: number | null;
          platform_cut?: number | null;
          runner_payout?: number | null;
          tip_amount?: number;
          stripe_payment_intent_id?: string | null;
          accepted_at?: string | null;
          picked_up_at?: string | null;
          dropped_off_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'jobs_customer_id_fkey'; columns: ['customer_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'jobs_runner_id_fkey'; columns: ['runner_id']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ];
      };
      packages: {
        Row: {
          id: string;
          job_id: string;
          item_name: string | null;
          item_description: string | null;
          qr_code_data: string | null;
          qr_image_path: string | null;
          item_photo_path: string | null;
          receipt_photo_path: string | null;
          dropoff_type: string | null;
          sort_order: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          item_name?: string | null;
          item_description?: string | null;
          qr_code_data?: string | null;
          qr_image_path?: string | null;
          item_photo_path?: string | null;
          receipt_photo_path?: string | null;
          dropoff_type?: string | null;
          sort_order?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          item_name?: string | null;
          item_description?: string | null;
          qr_code_data?: string | null;
          qr_image_path?: string | null;
          item_photo_path?: string | null;
          receipt_photo_path?: string | null;
          dropoff_type?: string | null;
          sort_order?: number | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'packages_job_id_fkey'; columns: ['job_id']; referencedRelation: 'jobs'; referencedColumns: ['id'] }
        ];
      };
      ratings: {
        Row: {
          id: string;
          job_id: string;
          rater_id: string;
          ratee_id: string;
          stars: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          rater_id: string;
          ratee_id: string;
          stars: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          rater_id?: string;
          ratee_id?: string;
          stars?: number;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'ratings_job_id_fkey'; columns: ['job_id']; referencedRelation: 'jobs'; referencedColumns: ['id'] },
          { foreignKeyName: 'ratings_rater_id_fkey'; columns: ['rater_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'ratings_ratee_id_fkey'; columns: ['ratee_id']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ];
      };
      runner_locations: {
        Row: {
          id: string;
          runner_id: string;
          lat: number;
          lng: number;
          heading: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          runner_id: string;
          lat: number;
          lng: number;
          heading?: number | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          runner_id?: string;
          lat?: number;
          lng?: number;
          heading?: number | null;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'runner_locations_runner_id_fkey'; columns: ['runner_id']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ];
      };
      job_declines: {
        Row: {
          id: string;
          job_id: string;
          runner_id: string;
          declined_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          runner_id: string;
          declined_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          runner_id?: string;
          declined_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'job_declines_job_id_fkey'; columns: ['job_id']; referencedRelation: 'jobs'; referencedColumns: ['id'] },
          { foreignKeyName: 'job_declines_runner_id_fkey'; columns: ['runner_id']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      job_status: JobStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
