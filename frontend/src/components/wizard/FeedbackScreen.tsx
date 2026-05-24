import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  Rating,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { CheckCircle2, MessageSquare } from 'lucide-react';
import { submitFeedback } from '../../api/client';

export default function FeedbackScreen({
  token,
  phase,
  onComplete,
}: {
  token: string;
  phase: 'PRE_OP' | 'POST_OP';
  onComplete: () => void;
}) {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitMode, setSubmitMode] = useState<'submit' | 'skip' | null>(null);

  const isSubmitting = submitMode !== null;
  const showComment = rating > 0;
  const commentLabel = rating > 0 && rating <= 3 ? 'Was können wir verbessern?' : 'Optionaler Kommentar';

  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => onComplete(), 1200);
    return () => clearTimeout(timer);
  }, [showSuccess, onComplete]);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setError('');
    setSubmitMode('submit');
    try {
      await submitFeedback(token, {
        phase,
        rating,
        comment: comment.trim() || undefined,
        skipped: false,
      });
      setShowSuccess(true);
    } catch {
      setError('Senden fehlgeschlagen. Sie können überspringen.');
    } finally {
      setSubmitMode(null);
    }
  };

  const handleSkip = async () => {
    setError('');
    setSubmitMode('skip');
    try {
      await submitFeedback(token, { phase, skipped: true });
    } catch {
      setError('Feedback konnte nicht gespeichert werden. Sie können trotzdem fortfahren.');
    } finally {
      setSubmitMode(null);
      setShowSuccess(true);
    }
  };

  if (showSuccess) {
    return (
      <Card withBorder radius="md" maw={640} mx="auto" p="lg">
        <Stack gap="md" align="center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-green-100 dark:bg-green-950/40">
            <CheckCircle2 size={44} className="text-green-600" />
          </div>
          <Title order={4}>Danke für Ihr Feedback!</Title>
          <Text size="sm" c="dimmed">Einen Moment bitte ...</Text>
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder radius="md" maw={640} mx="auto" p="lg">
      <Group gap="xs" mb={4}>
        <MessageSquare size={20} />
        <Title order={4}>Kurzes Feedback</Title>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Vielen Dank! Ihre Rückmeldung hilft uns, den Ablauf zu verbessern.
      </Text>
      <Stack gap="md">
        <Text fw={600}>Wie war Ihre Erfahrung mit dem Aufnahmeprozess?</Text>
        <div className="flex justify-center">
          <Rating size="xl" value={rating} onChange={setRating} />
        </div>
        {showComment && (
          <Textarea
            label={commentLabel}
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
            minRows={3}
            autosize
          />
        )}
        {error && <Alert color="yellow">{error}</Alert>}
        <Group gap="md">
          <Button variant="subtle" size="lg" className="flex-1" onClick={handleSkip} loading={submitMode === 'skip'} disabled={isSubmitting && submitMode !== 'skip'}>
            Überspringen
          </Button>
          <Button size="lg" className="flex-1" onClick={handleSubmit} disabled={rating === 0 || (isSubmitting && submitMode !== 'submit')} loading={submitMode === 'submit'}>
            Absenden
          </Button>
        </Group>
        <Text size="xs" c="dimmed">Antworten anonym</Text>
      </Stack>
    </Card>
  );
}
