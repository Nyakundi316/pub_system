/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "false" on hosts with no Socket.IO server (e.g. Vercel functions). */
  readonly VITE_REALTIME?: string;
}
