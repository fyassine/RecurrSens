import { useState } from 'react';
import axios from 'axios';
import { Alert, Button, Checkbox, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { Plus, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createPatient } from '../api/client';
import PatientAccessOptions from './PatientAccessOptions';

type ApiErrorData = {
  patient_id?: string[];
  detail?: string;
};

export default function CreatePatientDialog({
  onCreated,
  buttonSize = 'sm',
}: {
  onCreated: () => void;
  buttonSize?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [patientId, setPatientId] = useState('');
  const [startPostOp, setStartPostOp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string; patient_id: string } | null>(null);

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setStep(1);
      setPatientId('');
      setStartPostOp(false);
      setError('');
      setCreated(null);
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const patient = await createPatient(patientId, startPostOp);
      setCreated({ id: patient.id, patient_id: patient.patient_id });
      setStep(2);
      onCreated();
    } catch (err: unknown) {
      const data = axios.isAxiosError(err)
        ? (err.response?.data as ApiErrorData | undefined)
        : undefined;
      const detail = data?.patient_id?.[0] ?? data?.detail ?? 'Fehler beim Erstellen.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size={buttonSize}
        leftSection={<Plus size={16} />}
        onClick={() => setOpen(true)}
      >
        Patient anlegen
      </Button>

      <Modal
        opened={open}
        onClose={handleClose}
        title={step === 1 ? 'Patient erstellen' : undefined}
        size="sm"
        centered
        withCloseButton={step === 1}
      >
        <AnimatePresence mode="wait" initial={false}>
          {step === 1 ? (
            <motion.form
              key="step1"
              onSubmit={handleSubmit}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  Geben Sie die interne Patienten-ID ein, um einen neuen sicheren Token zu generieren.
                </Text>
                {error && <Alert color="red" variant="light">{error}</Alert>}
                <TextInput
                  label="Patienten-ID"
                  placeholder="z.B. P-1234"
                  required
                  autoFocus
                  value={patientId}
                  onChange={(e) => setPatientId(e.currentTarget.value)}
                />
                <Checkbox
                  id="start-post-op-checkbox"
                  label="Patient ist bereits postoperativ"
                  description="Erstvorstellung nach OP"
                  checked={startPostOp}
                  onChange={(e) => setStartPostOp(e.currentTarget.checked)}
                />
                <Group justify="flex-end">
                  <Button variant="default" onClick={handleClose}>Abbrechen</Button>
                  <Button type="submit" loading={loading}>Weiter</Button>
                </Group>
              </Stack>
            </motion.form>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
            >
              <Stack gap="md">
                <Group gap="xs">
                  <CheckCircle2 size={20} className="text-green-600" />
                  <Text fw={700}>Patient erstellt</Text>
                </Group>
                <Text size="sm" c="dimmed">
                  Patient <strong>{created?.patient_id}</strong> ist bereit.
                  {startPostOp && (
                    <> Der Patient wurde direkt als <strong>postoperativ</strong> eingestuft.</>
                  )}
                </Text>
                {created && <PatientAccessOptions patientId={created.id} patientLabel={created.patient_id} />}
                <Group justify="flex-end">
                  <Button onClick={handleClose}>Fertig</Button>
                </Group>
              </Stack>
            </motion.div>
          )}
        </AnimatePresence>
      </Modal>
    </>
  );
}
