import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { motion } from 'motion/react';
import { getMe, getUserRole, login } from '../api/client';
import { useAppData } from '../context/AppDataContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUserRole, setCenterName } = useAppData();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: { username: '', password: '' },
    validate: {
      username: (v) => (v.trim().length === 0 ? 'Erforderlich' : null),
      password: (v) => (v.length === 0 ? 'Erforderlich' : null),
    },
  });

  const handleSubmit = form.onSubmit(async (values) => {
    setError('');
    setLoading(true);
    try {
      await login(values.username, values.password);
      try {
        const me = await getMe();
        setUserRole(me.role);
        setCenterName(me.center_name);
      } catch {
        setUserRole(getUserRole());
        setCenterName(null);
      }
      navigate('/', { replace: true });
    } catch {
      setError('Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Zugangsdaten.');
    } finally {
      setLoading(false);
    }
  });

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
            <Title order={3}>RecurrSens</Title>
            <Text size="sm" c="dimmed">Admin-Anmeldung</Text>
          </Stack>

          {error && (
            <Alert color="red" mb="md" variant="light">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Benutzername"
                autoFocus
                required
                {...form.getInputProps('username')}
              />
              <PasswordInput
                label="Passwort"
                required
                {...form.getInputProps('password')}
              />
              <Button type="submit" fullWidth size="md" loading={loading} mt="sm">
                Anmelden
              </Button>
            </Stack>
          </form>
        </Paper>
      </motion.div>
    </div>
  );
}
