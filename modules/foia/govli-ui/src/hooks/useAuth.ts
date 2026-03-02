export function useAuth() {
  return { user: null, tenant: null, roles: [], isAuthenticated: false, logout: () => {} };
}
