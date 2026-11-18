// Reads the single Settings row. Falls back to defaults when the table does not exist yet
// (run supabase/migrations/20261118120000_settings.sql to create it).
import { supabaseAdmin } from '../config/supabase.js';
import { DEFAULT_SETTINGS } from './settings.js';

export async function getSettings() {
  try {
    const { data, error } = await supabaseAdmin.from('Settings').select('*').eq('id', 1).maybeSingle();
    if (error || !data) return { ...DEFAULT_SETTINGS, configured: false };
    const { id, updated_by, ...rest } = data;
    return { ...DEFAULT_SETTINGS, ...rest, configured: true };
  } catch {
    return { ...DEFAULT_SETTINGS, configured: false };
  }
}
