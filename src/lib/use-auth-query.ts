import { useAuth } from "@clerk/react";

// Adds the user's login token when connecting to an agent.
// Clerk tokens expire quickly, so we refresh them every 30 seconds.
export function useAuthQuery() {
  const { getToken, userId } = useAuth();
  return {
    query: async () => ({ token: (await getToken()) ?? "" }),
    queryDeps: [userId],
    cacheTtl: 30_000
  };
}
