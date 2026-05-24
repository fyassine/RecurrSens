import { useState } from 'react';
import { ActionIcon, Button, Group, Modal, Tooltip } from '@mantine/core';
import { ExternalLink } from 'lucide-react';
import type { Patient } from '../types';
import PatientAccessOptions from './PatientAccessOptions';

export default function PatientAccessDialog({ patient }: { patient: Patient }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip label="Zugangsoptionen">
        <ActionIcon variant="subtle" color="brand" size="sm" onClick={() => setOpen(true)}>
          <ExternalLink size={16} />
        </ActionIcon>
      </Tooltip>

      <Modal opened={open} onClose={() => setOpen(false)} title="Patienten-Zugang" size="sm" centered>
        <PatientAccessOptions patientId={patient.id} patientLabel={patient.patient_id} />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setOpen(false)}>Schließen</Button>
        </Group>
      </Modal>
    </>
  );
}
