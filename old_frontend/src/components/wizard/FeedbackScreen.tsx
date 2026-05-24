import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CircularProgress,
  Rating,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined';
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
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitMode, setSubmitMode] = useState<'submit' | 'skip' | null>(null);

  const isSubmitting = submitMode !== null;
  const showComment = rating !== null;
  const commentLabel = rating !== null && rating <= 3
    ? 'Was können wir verbessern?'
    : 'Optionaler Kommentar';

  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => onComplete(), 1200);
    return () => clearTimeout(timer);
  }, [showSuccess, onComplete]);

  const handleSubmit = async () => {
    if (rating === null) return;
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
      await submitFeedback(token, {
        phase,
        skipped: true,
      });
    } catch {
      setError('Feedback konnte nicht gespeichert werden. Sie können trotzdem fortfahren.');
    } finally {
      setSubmitMode(null);
      setShowSuccess(true);
    }
  };

  if (showSuccess) {
    return (
      <Card sx={{ maxWidth: 640, mx: 'auto', textAlign: 'center' }}>
        <CardHeader
          title={
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  bgcolor: 'success.light',
                  borderRadius: '50%',
                  width: 72,
                  height: 72,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 44, color: 'success.main' }} />
              </Box>
              <Typography variant="h5">Danke für Ihr Feedback!</Typography>
            </Box>
          }
        />
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Einen Moment bitte ...
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ maxWidth: 640, mx: 'auto' }}>
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <FeedbackOutlinedIcon color="action" />
            <Typography variant="h5">Kurzes Feedback</Typography>
          </Box>
        }
        subheader="Vielen Dank! Ihre Rückmeldung hilft uns, den Ablauf zu verbessern."
      />
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Typography variant="body1" fontWeight={600}>
          Wie war Ihre Erfahrung mit dem Aufnahmeprozess?
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Rating
            size="large"
            value={rating}
            onChange={(_event, value) => setRating(value)}
            sx={{ fontSize: 40 }}
          />
        </Box>

        {showComment && (
          <TextField
            label={commentLabel}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            multiline
            minRows={3}
            InputLabelProps={{ shrink: true }}
          />
        )}

        {error && <Alert severity="warning">{error}</Alert>}
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, gap: 2, alignItems: 'center' }}>
        <Button
          variant="text"
          size="large"
          onClick={handleSkip}
          disabled={isSubmitting}
          sx={{ flex: 1 }}
        >
          {submitMode === 'skip' ? <CircularProgress size={22} /> : 'Überspringen'}
        </Button>
        <Button
          variant="contained"
          size="large"
          onClick={handleSubmit}
          disabled={rating === null || isSubmitting}
          sx={{ flex: 1 }}
        >
          {submitMode === 'submit' ? <CircularProgress size={22} /> : 'Absenden'}
        </Button>
      </CardActions>
      <Box sx={{ pb: 2, px: 3 }}>
        <Typography variant="caption" color="text.secondary">
          Antworten anonym
        </Typography>
      </Box>
    </Card>
  );
}
