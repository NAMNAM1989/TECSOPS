/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SUPABASE_URL?: string;
  readonly VITE_DATA_SUPABASE_ANON_KEY?: string;
  readonly VITE_PROXY_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
