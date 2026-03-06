import { useAuth } from '../contexts/AuthContext'

export function RoleGate({ roles, children, fallback }: { roles: string[]; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { user } = useAuth()
  const ok = !!user && roles.includes(user.role)
  if (!ok) return <>{fallback ?? null}</>
  return <>{children}</>
}

export function useCan(...args: string[]) {
  const { user } = useAuth()
  return !!user && args.includes(user.role)
}