import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { motion } from 'motion/react';
import { resolveAccessCode } from '../api/client';

const CODE_LENGTH = 8;

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

function formatCode(normalized: string): string {
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

export default function AccessCodePage() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const normalized = normalizeCode(value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (normalized.length !== CODE_LENGTH) {
      setError('Bitte geben Sie den vollständigen 8-stelligen Code ein.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const token = await resolveAccessCode(normalized);
      navigate(`/p/${token}`, { replace: true });
    } catch {
      setError('Dieser Code ist ungültig oder abgelaufen. Bitte überprüfen Sie Ihre Eingabe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--mantine-color-body)] p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <Paper withBorder shadow="sm" radius="md" p="xl">
          <Stack gap="xs" align="center" mb="lg">
            <Title order={3}>Funktioniert der QR-Code nicht?</Title>
            <Text size="sm" c="dimmed" ta="center">
              Geben Sie den Code von Ihrem Ausdruck ein, um zu Ihren Sprachaufnahmen zu gelangen.
            </Text>
          </Stack>

          {error && (
            <Alert color="red" mb="md" variant="light">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Zugangscode"
                placeholder="XXXX-XXXX"
                autoFocus
                required
                size="lg"
                styles={{
                  label: { marginBottom: 8 },
                  input: { textAlign: 'center', letterSpacing: '0.15em', fontVariantNumeric: 'tabular-nums' },
                }}
                value={formatCode(normalized)}
                onChange={(e) => setValue(e.currentTarget.value)}
                maxLength={CODE_LENGTH + 1}
              />
              <Button
                type="submit"
                fullWidth
                size="md"
                loading={loading}
                disabled={normalized.length !== CODE_LENGTH}
              >
                Weiter
              </Button>
            </Stack>
          </form>
        </Paper>
      </motion.div>
    </div>
  );
}
