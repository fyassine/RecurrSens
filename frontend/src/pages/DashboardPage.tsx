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
import { getPatients, clearTokens, exportPatients } from '../api/client';
import type { Patient } from '../types';
import PatientList from '../components/PatientList';
import CreatePatientDialog from '../components/CreatePatientDialog';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleExport = async () => {
    setExporting(true);
    try {
      const ids = selectedIds.size > 0 ? [...selectedIds] : undefined;
      await exportPatients(ids);
      if (selectedIds.size > 0) setSelectedIds(new Set());
    } finally {
      setExporting(false);
    }
  };

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
            RecurrSens — Dashboard
          </Typography>
          <Button color="inherit" startIcon={<LogoutIcon />} onClick={handleLogout}>
            Abmelden
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ px: { xs: 2, md: 3 }, py: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={600}>
            Patienten
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting
                ? 'Exportiere…'
                : selectedIds.size > 0
                  ? `Auswahl exportieren (${selectedIds.size})`
                  : 'Alle exportieren'}
            </Button>
            <CreatePatientDialog onCreated={fetchPatients} />
          </Box>
        </Box>

        <PatientList
          patients={patients}
          loading={loading}
          onRefresh={fetchPatients}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      </Box>
    </Box>
  );
}
