import { useEffect, useState, useCallback } from 'react';
import {
  AppBar,
  Box,
  Button,
  Toolbar,
  Typography,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import DownloadIcon from '@mui/icons-material/Download';
import { useNavigate } from 'react-router-dom';
import { getPatients, clearTokens, getExportUrl } from '../api/client';
import type { Patient } from '../types';
import PatientList from '../components/PatientList';
import CreatePatientDialog from '../components/CreatePatientDialog';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPatients = useCallback(async () => {
    try {
      const data = await getPatients();
      setPatients(data);
    } catch {
      // 401 interceptor will clear tokens → redirect
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handleLogout = () => {
    clearTokens();
    navigate('/login', { replace: true });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Stimmbandläsion — Dashboard
          </Typography>
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout}>
            Abmelden
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ px: 5, py: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={600}>
            Patienten
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              component="a"
              href={getExportUrl()}
              target="_blank"
            >
              Daten exportieren
            </Button>
            <CreatePatientDialog onCreated={fetchPatients} />
          </Box>
        </Box>

        <PatientList patients={patients} loading={loading} onRefresh={fetchPatients} />
      </Box>
    </Box>
  );
}
