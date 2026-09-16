import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

// Guards Brent's personal pages (Networking, Quotes) -- mirrors AdminRoute,
// but keyed to his account specifically rather than the is_admin flag,
// since these aren't team-wide features.
const BRENT_EMAIL = 'brent@mudmarble.com';

export function BrentRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user?.email !== BRENT_EMAIL) return <Navigate to="/" replace />;

  return <>{children}</>;
}
