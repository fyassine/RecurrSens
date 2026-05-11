import { useState } from 'react';
import { Box, Snackbar, Alert, Typography, useTheme } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { downloadPatientPdf } from '../api/client';

interface ActionRowProps {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  description: string;
  onClick?: () => void;
  href?: string;
  target?: string;
}

function ActionRow({ icon, iconBg, iconColor, label, description, onClick, href, target }: ActionRowProps) {
  const isLink = !!href;
  return (
    <Box
      component={isLink ? 'a' : 'div'}
      href={isLink ? href : undefined}
      target={isLink ? target : undefined}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        px: 1.25,
        borderRadius: 1.5,
        cursor: 'pointer',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background 0.12s',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          bgcolor: iconBg,
          color: iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography fontSize="0.8125rem" fontWeight={600} color="text.primary" lineHeight={1.3}>
          {label}
        </Typography>
        <Typography fontSize="0.72rem" color="text.secondary" lineHeight={1.3} mt="1px">
          {description}
        </Typography>
      </Box>
    </Box>
  );
}

export default function PatientAccessOptions({
  patientId,
}: {
  patientId: string;
  patientLabel?: string;
}) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/p/${patientId}`);
    setCopied(true);
  };

  const p = theme.palette;
  const tint = (hex: string) => `${hex}20`;

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, py: 0.5 }}>
        <ActionRow
          icon={<ArrowForwardIcon sx={{ fontSize: 17 }} />}
          iconBg={tint(p.primary.main)}
          iconColor={p.primary.main}
          label="Details anzeigen"
          description="Patientenakte in der Klinikübersicht öffnen"
          href={`/details/${patientId}`}
        />
        <ActionRow
          icon={copied ? <CheckIcon sx={{ fontSize: 17 }} /> : <ContentCopyIcon sx={{ fontSize: 17 }} />}
          iconBg={tint(p.info.main)}
          iconColor={p.info.main}
          label={copied ? 'In Zwischenablage kopiert!' : 'Patienten-Link kopieren'}
          description="Direkten Link mit dem Patienten teilen"
          onClick={handleCopy}
        />
        <ActionRow
          icon={<PictureAsPdfIcon sx={{ fontSize: 17 }} />}
          iconBg={tint(p.warning.main)}
          iconColor={p.warning.main}
          label="PDF öffnen"
          description="Enthält QR-Code für einfachen Zugang"
          onClick={() => downloadPatientPdf(patientId)}
        />
        <ActionRow
          icon={<OpenInNewIcon sx={{ fontSize: 17 }} />}
          iconBg={tint(p.error.main)}
          iconColor={p.error.main}
          label="Patienten-Aufnahme öffnen"
          description="Patienten-seitige Aufnahme-App öffnen"
          href={`/p/${patientId}`}
          target="_blank"
        />
      </Box>

      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled">Link kopiert!</Alert>
      </Snackbar>
    </>
  );
}
