import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { EmptyState } from '../ui';
import { ShieldAlert } from 'lucide-react';

export function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Render children only if the user holds one of the permissions, else a notice. */
export function Gate({ anyOf, children }: { anyOf: string[]; children: ReactNode }) {
  const can = useAuth((s) => s.can);
  if (anyOf.length && !can(...anyOf)) {
    return (
      <div className="p-8">
        <EmptyState icon={<ShieldAlert size={28} />} title="You don't have access to this area" hint="Ask a manager or system admin to grant the right permission for your role." />
      </div>
    );
  }
  return <>{children}</>;
}
