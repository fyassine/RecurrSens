"""
DRF Serializers for the patients app.

Provides different serializer variants depending on the consumer:
- Admin endpoints get full detail serializers
- Patient-facing endpoints get restricted (public) serializers
- Create/update operations get dedicated serializers with validation
"""
from rest_framework import serializers
from .models import Patient, AudioFile, Exercise, RecordingSession


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
        fields = ['id', 'phase', 'session_number', 'created_at']
        read_only_fields = fields


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
# Patient Serializers
# =============================================================================

class PatientListSerializer(serializers.ModelSerializer):
    """
    Compact serializer for patient list view (admin dashboard).
    Includes audio file counts instead of full audio data.
    """
    audio_count_pre = serializers.SerializerMethodField()
    audio_count_post = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'status',
            'prediction_pre', 'prediction_post',
            'audio_count_pre', 'audio_count_post',
            'pre_op_date', 'post_op_date',
            'expires_at', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_audio_count_pre(self, obj):
        return obj.audio_files.filter(phase='PRE_OP').count()

    def get_audio_count_post(self, obj):
        return obj.audio_files.filter(phase='POST_OP').count()


class PatientDetailSerializer(serializers.ModelSerializer):
    """
    Full patient detail serializer (admin view).
    Includes nested audio file data and computed fields.
    """
    audio_files = AudioFileCompactSerializer(many=True, read_only=True)
    audio_files_pre = serializers.SerializerMethodField()
    audio_files_post = serializers.SerializerMethodField()
    sessions = RecordingSessionSerializer(many=True, read_only=True)

    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'status',
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
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'deleted_at']

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
    """
    audio_file_ids_pre = serializers.SerializerMethodField()
    audio_file_ids_post = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'status', 'patient_id',
            'audio_file_ids_pre', 'audio_file_ids_post',
            'created_at',
        ]
        read_only_fields = fields

    def get_audio_file_ids_pre(self, obj):
        return list(
            obj.audio_files.filter(phase='PRE_OP')
            .values_list('id', flat=True)
        )

    def get_audio_file_ids_post(self, obj):
        return list(
            obj.audio_files.filter(phase='POST_OP')
            .values_list('id', flat=True)
        )


class PatientCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new patient. Only requires patient_id."""

    class Meta:
        model = Patient
        fields = ['id', 'patient_id']
        read_only_fields = ['id']

    def validate_patient_id(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('Patienten-ID darf nicht leer sein.')
        if Patient.objects.filter(patient_id=value).exists():
            raise serializers.ValidationError(
                f'Ein Patient mit der ID "{value}" existiert bereits.'
            )
        return value.strip()


class PatientUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for updating patient data.
    Allows partial updates of demographics, diagnosis, and status.
    """

    class Meta:
        model = Patient
        fields = [
            'patient_id', 'status',
            'pre_op_date', 'post_op_date',
            # AI fields (set by inference service, but allowed via API too)
            'prediction_pre', 'ai_percentage_rp_pre',
            'gradcam_prediction_pre', 'gradcam_percentage_pre',
            'ai_reasoning_pre',
            'prediction_post', 'ai_percentage_rp_post',
            'gradcam_prediction_post', 'gradcam_percentage_post',
            'ai_reasoning_post',
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


# =============================================================================
# Completeness Serializer (read-only response)
# =============================================================================

class CompletenessSerializer(serializers.Serializer):
    """Response serializer for patient completeness check."""
    complete = serializers.BooleanField()
    missing = serializers.ListField(child=serializers.CharField())
    warnings = serializers.ListField(child=serializers.CharField())
