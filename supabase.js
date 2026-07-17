const { createClient } = require('@supabase/supabase-js');

// Support both Firebase Functions config and local .env
let supabaseUrl, supabaseAnonKey, supabaseServiceKey;

try {
  // Try Firebase Functions config first
  const functions = require('firebase-functions');
  const config = functions.config();
  supabaseUrl = config.supabase?.url;
  supabaseAnonKey = config.supabase?.anon_key;
  supabaseServiceKey = config.supabase?.service_role_key;
} catch (e) {
  // Fallback to local .env
  require('dotenv').config();
  supabaseUrl = process.env.SUPABASE_URL;
  supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  console.error('   For local: add to .env file');
  console.error('   For Firebase: run firebase functions:config:set supabase.url="..." supabase.service_role_key="..."');
  process.exit(1);
}

// Create a Supabase admin client using the service_role key.
// This bypasses Row Level Security (RLS) because Express handles all auth.
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// Also create a public client using the anon key for token verification
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

module.exports = { supabase, supabasePublic };