import { createClient } from '@supabase/supabase-js';

// URL yang benar: HANYA base domain-nya saja, tanpa embel-embel /rest/v1/
const supabaseUrl = 'https://pvbttqigvnljfrojcski.supabase.co'; 

// ANON KEY yang benar
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2YnR0cWlndm5samZyb2pjc2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTM4MjUsImV4cCI6MjA5NjA4OTgyNX0.GQgkQm3b-0Vi1ZzU52j-j1ihf2dYrXr0-vLcyFHMSiQ';

// Membuat jembatan koneksi
export const supabase = createClient(supabaseUrl, supabaseAnonKey);