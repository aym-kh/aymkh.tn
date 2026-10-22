/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_DATABUDDY_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
