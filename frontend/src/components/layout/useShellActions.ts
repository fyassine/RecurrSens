import { useNavigate } from 'react-router-dom';
import { clearTokens } from '../../api/client';
import { useAppData } from '../../context/AppDataContext';

/** Logout handler and center label shared by every shell layout. */
export function useShellActions() {
  const navigate = useNavigate();
  const { centerName, userRole, setCenterName, setUserRole } = useAppData();
  const centerLabel = centerName ?? (userRole === 'SUPER_ADMIN' ? 'Alle Zentren' : '');

  const logout = () => {
    clearTokens();
    setUserRole('SUPER_ADMIN');
    setCenterName(null);
    navigate('/login', { replace: true });
  };

  return { logout, centerLabel };
}
