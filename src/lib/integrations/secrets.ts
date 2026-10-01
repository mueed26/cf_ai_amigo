// Optional keys from .dev.vars. The app still runs if they're missing.
export type Secrets = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export function secrets(env: Env): Secrets {
  return env as unknown as Secrets;
}
