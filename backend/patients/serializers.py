"""
DRF Serializers for the patients app.

Provides different serializer variants depending on the consumer:
- Admin endpoints get full detail serializers
- Patient-facing endpoints get restricted (public) serializers
- Create/update operations get dedicated serializers with validation
"""
from rest_framework import serializers

from .models import AudioFile, Exercise, ExerciseSkip, Patient, PatientFeedback, RecordingSession
from .services import generate_next_patient_id, get_active_session

# =============================================================================
# Exercise Serializers
# =============================================================================

class ExerciseSerializer(serializers.ModelSerializer):
    """Read-only serializer for exercise configuration."""

    class Meta:
        model = Exercise
        fields = [
            'id', 'exercise_id', 'title', 'description',
            'example_audio_url',
            'order', 'is_active',
        ]
        read_only_fields = fields


# =============================================================================
# AudioFile Serializers
# =============================================================================

class RecordingSessionSerializer(serializers.ModelSerializer):
    """Serializer for recording sessions."""

    class Meta:
        model = RecordingSession
        fields = ['id', 'phase', 'session_number', 'created_at', 'visit_date']
        read_only_fields = fields


class RecordingSessionVisitDateSerializer(serializers.ModelSerializer):
    """Serializer for updating a recording session's visit date (admin only)."""

    class Meta:
        model = RecordingSession
        fields = ['id', 'visit_date']
        read_only_fields = ['id']


class AudioFileSerializer(serializers.ModelSerializer):
    """Full audio file metadata (admin view)."""

    class Meta:
        model = AudioFile
        fields = [
            'id', 'patient', 'session', 'exercise_id', 'phase',
            'storage_key', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class AudioFileCompactSerializer(serializers.ModelSerializer):
    """Compact audio file info for nested display in patient views."""

    class Meta:
        model = AudioFile
        fields = ['id', 'exercise_id', 'phase', 'session', 'created_at']
        read_only_fields = fields


# =============================================================================
# Feedback & Skips
# =============================================================================

class PatientFeedbackSerializer(serializers.ModelSerializer):
    """Read-only serializer for patient feedback entries."""

    class Meta:
        model = PatientFeedback
        fields = ['id', 'phase', 'rating', 'comment', 'skipped', 'created_at', 'updated_at']
        read_only_fields = fields


class PatientFeedbackCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating patient feedback."""

    class Meta:
        model = PatientFeedback
        fields = ['phase', 'rating', 'comment', 'skipped']

    def validate(self, attrs):
        skipped = attrs.get('skipped', False)
        rating = attrs.get('rating')

        if not skipped and rating is None:
            raise serializers.ValidationError('Bewertung ist erforderlich.')

        return attrs


class ExerciseSkipSerializer(serializers.ModelSerializer):
    """Serializer for skipped exercises."""

    class Meta:
        model = ExerciseSkip
        fields = ['id', 'phase', 'exercise_id', 'created_at']
        read_only_fields = fields


class ExerciseSkipCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating skipped exercises."""

    class Meta:
        model = ExerciseSkip
        fields = ['phase', 'exercise_id']

    def validate_exercise_id(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('exercise_id ist erforderlich.')
        return value.strip()


# =============================================================================
# Patient Serializers
# =============================================================================

class PatientListSerializer(serializers.ModelSerializer):
    """
    Compact serializer for patient list view (admin dashboard).
    Includes audio file counts instead of full audio data.
    """
    audio_count_pre = serializers.SerializerMethodField()
    audio_count_post = serializers.SerializerMethodField()
    current_post_op_session_number = serializers.SerializerMethodField()
    last_activity = serializers.ReadOnlyField()
    access_code_formatted = serializers.ReadOnlyField()

    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'center', 'status',
            'prediction_pre', 'prediction_post',
            'audio_count_pre', 'audio_count_post',
            'current_post_op_session_number',
            'pre_op_date', 'post_op_date',
            'deleted_at',
            'expires_at', 'created_at', 'updated_at',
            'last_activity', 'access_code_formatted',
        ]
        read_only_fields = fields

    def get_audio_count_pre(self, obj):
        return obj.audio_files.filter(phase='PRE_OP').count()

    def get_audio_count_post(self, obj):
        return obj.audio_files.filter(phase='POST_OP').count()

    def get_current_post_op_session_number(self, obj):
        session = get_active_session(obj, 'POST_OP')
        return session.session_number if session else None


class PatientDetailSerializer(serializers.ModelSerializer):
    """
    Full patient detail serializer (admin view).
    Includes nested audio file data and computed fields.
    """
    audio_files = AudioFileCompactSerializer(many=True, read_only=True)
    audio_files_pre = serializers.SerializerMethodField()
    audio_files_post = serializers.SerializerMethodField()
    sessions = RecordingSessionSerializer(many=True, read_only=True)
    last_activity = serializers.ReadOnlyField()
    access_code_formatted = serializers.ReadOnlyField()

    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'status',
            'access_code_formatted',
            'pre_op_date', 'post_op_date',
            # Pre-OP AI
            'prediction_pre', 'ai_percentage_rp_pre',
            'gradcam_prediction_pre', 'gradcam_percentage_pre',
            'ai_reasoning_pre',
            # Post-OP AI
            'prediction_post', 'ai_percentage_rp_post',
            'gradcam_prediction_post', 'gradcam_percentage_post',
            'ai_reasoning_post',
            # Metadata
            'deleted_at', 'expires_at', 'created_at', 'updated_at',
            # Sessions & Audio
            'sessions', 'audio_files', 'audio_files_pre', 'audio_files_post',
            'last_activity',
        ]
        read_only_fields = ['id', 'updated_at', 'deleted_at']

    def get_audio_files_pre(self, obj):
        pre_files = obj.audio_files.filter(phase='PRE_OP')
        return AudioFileCompactSerializer(pre_files, many=True).data

    def get_audio_files_post(self, obj):
        post_files = obj.audio_files.filter(phase='POST_OP')
        return AudioFileCompactSerializer(post_files, many=True).data


class PatientPublicSerializer(serializers.ModelSerializer):
    """
    Patient-facing serializer. Omits sensitive AI internals and admin-only fields.
    Used by the patient wizard (accessed via UUID token in URL).
    Completion and skip tracking are scoped to the active session so that
    longitudinal follow-up sessions always start with a clean slate.
    """
    completed_exercise_ids_pre = serializers.SerializerMethodField()
    completed_exercise_ids_post = serializers.SerializerMethodField()
    skipped_exercise_ids_pre = serializers.SerializerMethodField()
    skipped_exercise_ids_post = serializers.SerializerMethodField()
    feedback_submitted_pre = serializers.SerializerMethodField()
    feedback_submitted_post = serializers.SerializerMethodField()
    current_post_op_session_number = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'status', 'patient_id',
            'completed_exercise_ids_pre', 'completed_exercise_ids_post',
            'skipped_exercise_ids_pre', 'skipped_exercise_ids_post',
            'feedback_submitted_pre', 'feedback_submitted_post',
            'current_post_op_session_number',
            'created_at',
        ]
        read_only_fields = fields

    def get_completed_exercise_ids_pre(self, obj):
        session = get_active_session(obj, 'PRE_OP')
        if not session:
            return []
        return list(obj.audio_files.filter(session=session).values_list('exercise_id', flat=True))

    def get_completed_exercise_ids_post(self, obj):
        session = get_active_session(obj, 'POST_OP')
        if not session:
            return []
        return list(obj.audio_files.filter(session=session).values_list('exercise_id', flat=True))

    def get_skipped_exercise_ids_pre(self, obj):
        session = get_active_session(obj, 'PRE_OP')
        if not session:
            return []
        return list(obj.exercise_skips.filter(session=session).values_list('exercise_id', flat=True))

    def get_skipped_exercise_ids_post(self, obj):
        session = get_active_session(obj, 'POST_OP')
        if not session:
            return []
        return list(obj.exercise_skips.filter(session=session).values_list('exercise_id', flat=True))

    def get_feedback_submitted_pre(self, obj):
        return obj.feedback_entries.filter(phase='PRE_OP').exists()

    def get_feedback_submitted_post(self, obj):
        return obj.feedback_entries.filter(phase='POST_OP').exists()

    def get_current_post_op_session_number(self, obj):
        session = get_active_session(obj, 'POST_OP')
        return session.session_number if session else None


class PatientCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new patient. patient_id is optional — if left
    blank, it is auto-generated by incrementing the last patient's numeric ID.
    """

    patient_id = serializers.CharField(required=False, allow_blank=True, default='')
    start_post_op = serializers.BooleanField(
        default=False,
        write_only=True,
        help_text='When true, the patient is initialised directly as POST_OP_STARTED.',
    )

    class Meta:
        model = Patient
        fields = ['id', 'patient_id', 'center', 'start_post_op']
        read_only_fields = ['id', 'center']

    def validate_patient_id(self, value):
        value = value.strip()
        if not value:
            generated = generate_next_patient_id()
            if generated is None:
                raise serializers.ValidationError(
                    'Automatische Nummerierung nicht möglich. Bitte geben Sie eine Patienten-ID an.'
                )
            return generated
        if Patient.objects.filter(patient_id=value).exists():
            raise serializers.ValidationError(
                f'Ein Patient mit der ID "{value}" existiert bereits.'
            )
        return value


class PatientUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating patient demographics and status (admin only).

    Deliberately excludes the AI prediction fields, which are written exclusively
    by the inference task via the ORM.
    """
    created_at = serializers.DateTimeField(required=False)
    expires_at = serializers.DateTimeField(required=False)

    class Meta:
        model = Patient
        fields = [
            'patient_id',
            'status',
            'pre_op_date', 'post_op_date',
            'created_at', 'expires_at',
        ]

    def validate_patient_id(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Patienten-ID darf nicht leer sein.')
        # Check uniqueness excluding current instance
        instance = self.instance
        if Patient.objects.filter(patient_id=value).exclude(pk=instance.pk if instance else None).exists():
            raise serializers.ValidationError(
                f'Ein Patient mit der ID "{value}" existiert bereits.'
            )
        return value.strip()

    def update(self, instance, validated_data):
        import logging

        from django.utils import timezone
        logger = logging.getLogger(__name__)

        old_status = instance.status
        old_patient_id = instance.patient_id
        old_created_at = instance.created_at
        old_expires_at = instance.expires_at

        new_status = validated_data.get('status', old_status)

        instance = super().update(instance, validated_data)

        # ── Write audit log entries ──────────────────────────────────────────
        try:
            from .models import PatientAuditLog
            changed_fields = []
            if new_status != old_status:
                status_labels = {
                    'NEW': 'Neu',
                    'CONSENT_GIVEN': 'Einwilligung erteilt',
                    'PRE_OP_DONE': 'Prä-OP abgeschlossen',
                    'POST_OP_STARTED': 'Post-OP begonnen',
                    'POST_OP_DONE': 'Post-OP abgeschlossen',
                }
                old_label = status_labels.get(old_status, old_status)
                new_label = status_labels.get(new_status, new_status)
                PatientAuditLog.objects.create(
                    patient=instance,
                    event_type=PatientAuditLog.EventType.EDIT,
                    event='Status geändert',
                    detail=f'{old_label} → {new_label}',
                    files=[],
                    actor=PatientAuditLog.Actor.ADMIN,
                    actor_name='admin',
                )
            if instance.patient_id != old_patient_id:
                changed_fields.append(f'Patienten-ID: {old_patient_id} → {instance.patient_id}')
            if 'created_at' in validated_data and validated_data['created_at'] is not None:
                new_created_at = validated_data['created_at']
                # Check if date has actually changed to avoid logging identical times or tz conversions
                if old_created_at.date() != new_created_at.date():
                    old_date_str = old_created_at.strftime('%d.%m.%Y')
                    new_date_str = new_created_at.strftime('%d.%m.%Y')
                    changed_fields.append(f'Erstellungsdatum: {old_date_str} → {new_date_str}')
            if 'expires_at' in validated_data and validated_data['expires_at'] is not None:
                new_expires_at = validated_data['expires_at']
                if old_expires_at.date() != new_expires_at.date():
                    old_exp_str = old_expires_at.strftime('%d.%m.%Y')
                    new_exp_str = new_expires_at.strftime('%d.%m.%Y')
                    changed_fields.append(f'Ablaufdatum: {old_exp_str} → {new_exp_str}')

            if changed_fields:
                PatientAuditLog.objects.create(
                    patient=instance,
                    event_type=PatientAuditLog.EventType.EDIT,
                    event='Patientendaten bearbeitet',
                    detail='; '.join(changed_fields),
                    files=[],
                    actor=PatientAuditLog.Actor.ADMIN,
                    actor_name='admin',
                )
        except Exception:
            logger.exception('Failed to write edit audit log for patient %s', instance.id)

        if new_status != old_status:
            # Handle status transition side effects
            if new_status == Patient.Status.CONSENT_GIVEN:
                RecordingSession.objects.get_or_create(
                    patient=instance,
                    phase=RecordingSession.Phase.PRE_OP,
                    session_number=1,
                )
            elif new_status == Patient.Status.POST_OP_STARTED:
                RecordingSession.objects.get_or_create(
                    patient=instance,
                    phase=RecordingSession.Phase.POST_OP,
                    session_number=1,
                )

            # Update dates if not set
            now = timezone.now()
            if new_status == Patient.Status.PRE_OP_DONE and not instance.pre_op_date:
                instance.pre_op_date = now
                instance.save(update_fields=['pre_op_date'])
            elif new_status == Patient.Status.POST_OP_DONE and not instance.post_op_date:
                instance.post_op_date = now
                instance.save(update_fields=['post_op_date'])

            # Trigger inference if appropriate
            if new_status in (Patient.Status.PRE_OP_DONE, Patient.Status.POST_OP_DONE):
                try:
                    from .tasks import run_inference_task
                    phase = 'PRE_OP' if new_status == Patient.Status.PRE_OP_DONE else 'POST_OP'
                    run_inference_task.delay(str(instance.id), phase)
                except Exception as e:
                    logger.error(f'Failed to trigger inference for patient {instance.id}: {e}')

        return instance


# =============================================================================
# Completeness Serializer (read-only response)
# =============================================================================

class CompletenessSerializer(serializers.Serializer):
    """Response serializer for patient completeness check."""
    complete = serializers.BooleanField()
    missing = serializers.ListField(child=serializers.CharField())
    warnings = serializers.ListField(child=serializers.CharField())
