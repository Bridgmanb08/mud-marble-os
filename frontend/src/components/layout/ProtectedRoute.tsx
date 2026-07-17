import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <span style={{ color: 'var(--t2)', fontSize: 13 }}>Loading…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
