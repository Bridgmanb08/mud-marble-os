import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user?.is_admin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
