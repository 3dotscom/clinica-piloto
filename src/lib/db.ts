import { createClient } from '@supabase/supabase-js';

// Variables proporcionadas por la integración Supabase de Vercel.
const supabaseUrl = process.env.CLINIC_SUPABASE_URL || process.env.NEXT_PUBLIC_CLINIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.CLINIC_SUPABASE_SERVICE_ROLE_KEY || process.env.CLINIC_SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Permite arrancar el dashboard en local sin credenciales; las consultas devuelven listas vacías.
// En producción, configura ambas variables para usar Supabase real.
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : ({
      from: () => ({
        select: () => ({
          order: async () => ({ data: [], error: null }),
          eq: () => ({ single: async () => ({ data: null, error: null }) }),
          single: async () => ({ data: null, error: null }),
        }),
        upsert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        insert: async () => ({ data: null, error: null }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }),
      storage: { from: () => ({ upload: async () => ({ data: null, error: null }) }) },
    } as any);
