import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lufymhcymrwavfrjjuwu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1ZnltaGN5bXJ3YXZmcmpqdXd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNzE1MjIsImV4cCI6MjA4ODY0NzUyMn0.DR0e7WAD6LmWIZSnRceLiwB50501Rws4u3Z0OH6IqpQ';

export const supabase = createClient(supabaseUrl, supabaseKey);

