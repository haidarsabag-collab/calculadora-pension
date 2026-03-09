import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lufymhcymrwavfrjjuwu.supabase.co';
const supabaseKey = 'sb_publishable_o7e0eEKSQF3SlFNiEucefA_5V5yp-pL';

export const supabase = createClient(supabaseUrl, supabaseKey);
