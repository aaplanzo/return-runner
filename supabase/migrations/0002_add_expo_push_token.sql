-- Add expo_push_token to users table for push notification delivery
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token text;
