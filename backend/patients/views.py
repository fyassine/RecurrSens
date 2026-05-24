"""
DRF Views for the patients app.

Endpoint summary:
    Admin (JWT required):
        GET    /api/patients/                  List all patients
        POST   /api/patients/                  Create a new patient
        GET    /api/patients/{token}/          Get patient details
        PATCH  /api/patients/{token}/          Update patient data
        DELETE /api/patients/{token}/          Delete patient + files
        POST   /api/patients/{token}/advance/  Advance workflow step
        GET    /api/patients/{token}/completeness/  Check data completeness
        GET    /api/patients/{token}/pdf/      Download QR code PDF
        GET    /api/export/                    Export data as ZIP

    Patient-facing (UUID token, no JWT):
        GET    /api/p/{token}/                 Get public patient data
        PATCH  /api/p/{token}/                 Update patient demographics
        POST   /api/p/{token}/advance/         Advance workflow step
        POST   /api/p/{token}/audio/upload/    Upload audio (server-side)
        POST   /api/p/{token}/audio/presign/   Get pre-signed upload URL

    Public:
        GET    /api/exercises/                 List active exercises
        GET    /api/audio/{file_id}/           Stream audio file (proxy)
        GET    /api/audio/{file_id}/url/       Get pre-signed download URL
"""
import logging
from datetime import datetime

from django.core.exceptions import ValidationError
from django.http import HttpResponse, StreamingHttpResponse
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Patient, AudioFile, Exercise, RecordingSession, PatientFeedback, ExerciseSkip
from .serializers import (
    PatientListSerializer,
    PatientDetailSerializer,
    PatientPublicSerializer,
    PatientCreateSerializer,
    PatientUpdateSerializer,
    ExerciseSerializer,
    AudioFileSerializer,
    CompletenessSerializer,
    RecordingSessionSerializer,
    PatientFeedbackSerializer,
    PatientFeedbackCreateSerializer,
    ExerciseSkipSerializer,
    ExerciseSkipCreateSerializer,
)
from .permissions import IsAdminUser, IsPatientTokenValid, IsAdminOrPatientToken
from . import services
from .audio_validation import (
    ALLOWED_EXTENSIONS,
    extension_for_content_type,
    validate_audio_upload,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Admin Patient ViewSet (JWT required)
# =============================================================================

class PatientViewSet(viewsets.ModelViewSet):
    """
    Admin-facing patient CRUD endpoints.
    Requires JWT authentication.
    """
    permission_classes = [IsAuthenticated]
    pagination_class = None
    lookup_field = 'pk'

    def get_queryset(self):
        return Patient.objects.prefetch_related('audio_files').all()

    def get_serializer_class(self):
        if self.action == 'list':
            return PatientListSerializer
        if self.action == 'create':
            return PatientCreateSerializer
        if self.action in ('update', 'partial_update'):
            return PatientUpdateSerializer
        return PatientDetailSerializer

    def perform_destroy(self, instance):
        """Delete patient along with S3 audio files."""
        services.delete_patient_with_files(instance)

    # --- Custom actions ---

    @action(detail=True, methods=['post'], url_path='advance')
    def advance(self, request, pk=None):
        """Advance patient to the next workflow step."""
        patient = self.get_object()
        try:
            patient = services.advance_patient_step(patient)
            return Response(
                PatientDetailSerializer(patient).data,
                status=status.HTTP_200_OK,
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=['get'], url_path='completeness')
    def completeness(self, request, pk=None):
        """Check data completeness for a patient."""
        patient = self.get_object()
        result = services.check_completeness(patient)
        return Response(
            CompletenessSerializer(result).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'], url_path='pdf')
    def pdf(self, request, pk=None):
        """Generate and download the patient QR code PDF."""
        patient = self.get_object()
        try:
            pdf_bytes = services.generate_patient_pdf(patient)
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = (
                f'attachment; filename="patient_{patient.patient_id}.pdf"'
            )
            return response
        except Exception as e:
            logger.error(f'PDF generation failed for {patient.patient_id}: {e}')
            return Response(
                {'error': 'PDF-Erstellung fehlgeschlagen.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='sessions')
    def create_session(self, request, pk=None):
        """Create a new recording session for a patient (admin triggers post-op sessions)."""
        patient = self.get_object()
        phase = request.data.get('phase')

        if phase not in ('PRE_OP', 'POST_OP'):
            return Response(
                {'error': 'Phase muss PRE_OP oder POST_OP sein.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session = services.create_recording_session(patient, phase)

        # Reopen the wizard for longitudinal follow-up sessions
        if phase == 'POST_OP' and patient.status == Patient.Status.POST_OP_DONE:
            patient.status = Patient.Status.POST_OP_STARTED
            patient.save(update_fields=['status', 'updated_at'])

        # TODO: Send email notification with QR code / recording link to patient
        return Response(
            RecordingSessionSerializer(session).data,
            status=status.HTTP_201_CREATED,
        )


# =============================================================================
# Patient-Facing Views (UUID token auth, no JWT)
# =============================================================================

class PatientPublicView(APIView):
    """
    Patient-facing endpoint accessed via UUID token in the URL.
    Supports GET (read data) and PATCH (update demographics).
    """
    authentication_classes = []  # No session/JWT — UUID token in URL
    permission_classes = [IsPatientTokenValid]

    def get(self, request, token):
        """Get public patient data."""
        try:
            patient = Patient.objects.prefetch_related(
                'audio_files', 'exercise_skips', 'feedback_entries'
            ).get(id=token)
        except Patient.DoesNotExist:
            return Response(
                {'error': 'Patient nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = PatientPublicSerializer(patient)
        return Response(serializer.data)

    def patch(self, request, token):
        """Update patient status (patient-facing PATCH)."""
        try:
            patient = Patient.objects.get(id=token)
        except Patient.DoesNotExist:
            return Response(
                {'error': 'Patient nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Only allow updates during specific workflow steps
        allowed_statuses = [
            Patient.Status.NEW,
            Patient.Status.CONSENT_GIVEN,
        ]
        allowed_fields = {'status'}

        # Filter to only allowed fields
        filtered_data = {
            k: v for k, v in request.data.items() if k in allowed_fields
        }

        serializer = PatientUpdateSerializer(
            patient, data=filtered_data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(PatientPublicSerializer(patient).data)


class PatientPublicAdvanceView(APIView):
    """Advance patient workflow step (accessed via UUID token)."""
    authentication_classes = []  # No session/JWT — UUID token in URL
    permission_classes = [IsPatientTokenValid]

    def post(self, request, token):
        try:
            patient = Patient.objects.get(id=token)
        except Patient.DoesNotExist:
            return Response(
                {'error': 'Patient nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            patient = services.advance_patient_step(patient)
            return Response(
                PatientPublicSerializer(patient).data,
                status=status.HTTP_200_OK,
            )
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )


class PatientFeedbackView(APIView):
    """Create or query feedback entries (UUID token auth)."""
    authentication_classes = []
    permission_classes = [IsPatientTokenValid]

    def get(self, request, token):
        phase = request.query_params.get('phase')
        if phase not in ('PRE_OP', 'POST_OP'):
            return Response(
                {'error': 'Phase muss PRE_OP oder POST_OP sein.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exists = PatientFeedback.objects.filter(patient_id=token, phase=phase).exists()
        return Response({'exists': exists}, status=status.HTTP_200_OK)

    def post(self, request, token):
        try:
            patient = Patient.objects.get(id=token)
        except Patient.DoesNotExist:
            return Response(
                {'error': 'Patient nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PatientFeedbackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        feedback, created = PatientFeedback.objects.update_or_create(
            patient=patient,
            phase=data['phase'],
            defaults={
                'rating': data.get('rating'),
                'comment': data.get('comment', ''),
                'skipped': data.get('skipped', False),
            },
        )

        return Response(
            PatientFeedbackSerializer(feedback).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ExerciseSkipView(APIView):
    """Persist a skipped exercise (UUID token auth)."""
    authentication_classes = []
    permission_classes = [IsPatientTokenValid]

    def post(self, request, token):
        try:
            patient = Patient.objects.get(id=token)
        except Patient.DoesNotExist:
            return Response(
                {'error': 'Patient nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ExerciseSkipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        active_session = services.get_active_session(patient, data['phase'])
        skip, created = ExerciseSkip.objects.get_or_create(
            patient=patient,
            session=active_session,
            exercise_id=data['exercise_id'],
            defaults={'phase': data['phase']},
        )

        return Response(
            ExerciseSkipSerializer(skip).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


# =============================================================================
# Audio Upload Views
# =============================================================================

class AudioUploadView(APIView):
    """
    Server-side audio file upload.
    For clients that can't use pre-signed URLs directly.
    """
    authentication_classes = [JWTAuthentication]  # JWT for admin, or UUID token via IsAdminOrPatientToken
    permission_classes = [IsAdminOrPatientToken]

    def post(self, request, token):
        try:
            patient = Patient.objects.get(id=token)
        except Patient.DoesNotExist:
            return Response(
                {'error': 'Patient nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        file = request.FILES.get('file')
        exercise_id = request.data.get('exerciseId') or request.data.get('exercise_id')

        if not file or not exercise_id:
            return Response(
                {'error': 'Datei und exerciseId sind erforderlich.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            extension, content_type = validate_audio_upload(file)
        except ValidationError as e:
            return Response(
                {'error': e.message if hasattr(e, 'message') else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine phase from patient status
        is_post_op = patient.status in (
            Patient.Status.POST_OP_STARTED,
            Patient.Status.POST_OP_DONE,
        )
        phase = 'POST_OP' if is_post_op else 'PRE_OP'
        phase_folder = 'post' if is_post_op else 'pre'

        # Find active session for this phase
        session = services.get_active_session(patient, phase)

        # Build storage key (include session number if session exists)
        if session:
            key = f'{token}/{phase_folder}_{session.session_number}/{exercise_id}.{extension}'
        else:
            key = f'{token}/{phase_folder}/{exercise_id}.{extension}'

        # Upload to S3
        try:
            file_data = file.read()
            services.upload_audio_to_s3(file_data, key, content_type)
        except Exception as e:
            logger.error(f'S3 upload failed for {key}: {e}')
            return Response(
                {'error': 'Datei-Upload fehlgeschlagen.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Replace any existing record for this exercise/phase before creating the new one.
        # Do not filter by session — the existing record may belong to a different (or null) session.
        AudioFile.objects.filter(
            patient=patient,
            exercise_id=exercise_id,
            phase=phase,
        ).delete()

        # Create DB record
        try:
            audio_file = AudioFile.objects.create(
                patient=patient,
                session=session,
                exercise_id=exercise_id,
                phase=phase,
                storage_key=key,
            )
        except Exception as e:
            # Cleanup S3 if DB save fails
            logger.error(f'DB save failed for {key}, cleaning up S3: {e}')
            services.delete_audio_from_s3(key)
            return Response(
                {'error': 'Datenbank-Fehler bei Datei-Upload.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {'id': str(audio_file.id), 'storage_key': key},
            status=status.HTTP_201_CREATED,
        )


class AudioPresignView(APIView):
    """
    Generate a pre-signed URL for direct client upload to S3/MinIO.
    The client uploads the file directly, then confirms by calling
    the upload endpoint to create the DB record.
    """
    permission_classes = [IsAdminOrPatientToken]

    def post(self, request, token):
        try:
            patient = Patient.objects.get(id=token)
        except Patient.DoesNotExist:
            return Response(
                {'error': 'Patient nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        exercise_id = request.data.get('exerciseId') or request.data.get('exercise_id')
        content_type = request.data.get('contentType', 'audio/webm')

        if not exercise_id:
            return Response(
                {'error': 'exerciseId ist erforderlich.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine phase
        is_post_op = patient.status in (
            Patient.Status.POST_OP_STARTED,
            Patient.Status.POST_OP_DONE,
        )
        phase = 'POST_OP' if is_post_op else 'PRE_OP'
        phase_folder = 'post' if is_post_op else 'pre'

        extension = extension_for_content_type(content_type)
        if extension is None:
            return Response(
                {'error': 'Nicht unterstütztes Audioformat.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        key = f'{token}/{phase_folder}/{exercise_id}.{extension}'

        try:
            upload_url = services.generate_presigned_upload_url(key, content_type)
        except Exception as e:
            logger.error(f'Pre-sign URL generation failed for {key}: {e}')
            return Response(
                {'error': 'URL-Generierung fehlgeschlagen.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({
            'upload_url': upload_url,
            'storage_key': key,
            'phase': phase,
            'exercise_id': exercise_id,
        })


class AudioPresignConfirmView(APIView):
    """
    Confirm a pre-signed upload: create the DB record after the client
    has successfully uploaded the file directly to S3.
    """
    permission_classes = [IsAdminOrPatientToken]

    def post(self, request, token):
        try:
            patient = Patient.objects.get(id=token)
        except Patient.DoesNotExist:
            return Response(
                {'error': 'Patient nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        storage_key = request.data.get('storage_key')
        exercise_id = request.data.get('exerciseId') or request.data.get('exercise_id')
        phase = request.data.get('phase', 'PRE_OP')

        if not storage_key or not exercise_id:
            return Response(
                {'error': 'storage_key und exerciseId sind erforderlich.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        suffix = storage_key.rsplit('.', 1)[-1].lower() if '.' in storage_key else ''
        if suffix not in ALLOWED_EXTENSIONS:
            return Response(
                {'error': 'Nicht unterstütztes Audioformat.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        audio_file = AudioFile.objects.create(
            patient=patient,
            exercise_id=exercise_id,
            phase=phase,
            storage_key=storage_key,
        )

        return Response(
            {'id': str(audio_file.id), 'storage_key': storage_key},
            status=status.HTTP_201_CREATED,
        )


# =============================================================================
# Audio File Reassignment (admin)
# =============================================================================

class AudioFileReassignView(APIView):
    """
    PATCH /api/audio/<file_id>/reassign/
    Reassign an audio recording to a different phase/session.
    Requires JWT (admin only). The change is purely metadata — the S3 object
    is NOT moved; only the DB record's phase and session fields are updated.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, file_id):
        try:
            audio_file = AudioFile.objects.select_related('patient').get(id=file_id)
        except AudioFile.DoesNotExist:
            return Response(
                {'error': 'Datei nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        new_phase = request.data.get('phase')
        new_session_id = request.data.get('session')  # UUID string or null

        if new_phase not in ('PRE_OP', 'POST_OP'):
            return Response(
                {'error': 'Phase muss PRE_OP oder POST_OP sein.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate the session belongs to this patient and matches the phase
        if new_session_id:
            try:
                new_session = RecordingSession.objects.get(
                    id=new_session_id,
                    patient=audio_file.patient,
                    phase=new_phase,
                )
            except RecordingSession.DoesNotExist:
                return Response(
                    {'error': 'Sitzung nicht gefunden oder gehört nicht zu diesem Patienten.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            new_session = None

        audio_file.phase = new_phase
        audio_file.session = new_session
        audio_file.save(update_fields=['phase', 'session'])

        from .serializers import AudioFileCompactSerializer
        return Response(
            AudioFileCompactSerializer(audio_file).data,
            status=status.HTTP_200_OK,
        )


# =============================================================================
# Audio Streaming / Download
# =============================================================================

class AudioStreamView(APIView):
    """
    Proxy audio file from S3/MinIO for playback.
    No authentication required — serves audio by file ID.
    """
    permission_classes = [AllowAny]

    def get(self, request, file_id):
        try:
            audio_file = AudioFile.objects.get(id=file_id)
        except AudioFile.DoesNotExist:
            return Response(
                {'error': 'Datei nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = services.get_audio_from_s3(audio_file.storage_key)
        if data is None:
            return Response(
                {'error': 'Datei konnte nicht geladen werden.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Determine MIME type
        mime_types = {
            'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'webm': 'audio/webm',
            'ogg': 'audio/ogg', 'm4a': 'audio/mp4', 'aac': 'audio/aac',
            'flac': 'audio/flac',
        }
        ext = audio_file.storage_key.rsplit('.', 1)[-1].lower()
        content_type = mime_types.get(ext, 'audio/mpeg')

        response = HttpResponse(data, content_type=content_type)
        response['Content-Length'] = len(data)
        response['Accept-Ranges'] = 'bytes'
        response['Cache-Control'] = 'public, max-age=31536000, immutable'
        return response


class AudioDownloadUrlView(APIView):
    """Get a pre-signed download URL for an audio file."""
    permission_classes = [IsAuthenticated]

    def get(self, request, file_id):
        try:
            audio_file = AudioFile.objects.get(id=file_id)
        except AudioFile.DoesNotExist:
            return Response(
                {'error': 'Datei nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            url = services.generate_presigned_download_url(audio_file.storage_key)
            return Response({'url': url})
        except Exception as e:
            logger.error(f'Download URL generation failed: {e}')
            return Response(
                {'error': 'URL-Generierung fehlgeschlagen.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# =============================================================================
# Exercise List
# =============================================================================

class ExerciseListView(generics.ListAPIView):
    """List all active voice exercises. Public endpoint."""
    permission_classes = [AllowAny]
    serializer_class = ExerciseSerializer
    queryset = Exercise.objects.filter(is_active=True)
    pagination_class = None  # No pagination for exercises


# =============================================================================
# Data Export
# =============================================================================

class ExportView(APIView):
    """Export patient data as a ZIP file.

    Query params:
        ids: Optional comma-separated list of patient UUIDs to export.
             When omitted, exports all completed patients.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import uuid as _uuid

        ids_param = request.query_params.get('ids', '').strip()
        patient_ids = None

        if ids_param:
            patient_ids = []
            for raw in ids_param.split(','):
                raw = raw.strip()
                try:
                    patient_ids.append(str(_uuid.UUID(raw)))
                except ValueError:
                    return Response(
                        {'error': f'Ungültige Patienten-ID: {raw}'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        try:
            zip_bytes = services.export_patients_zip(patient_ids=patient_ids)
            today = datetime.now().strftime('%Y-%m-%d')

            if patient_ids and len(patient_ids) == 1:
                try:
                    pid = Patient.objects.get(id=patient_ids[0]).patient_id
                    filename = f'{pid}_export_{today}.zip'
                except Patient.DoesNotExist:
                    filename = f'patienten_export_{today}.zip'
            else:
                filename = f'patienten_export_{today}.zip'

            response = HttpResponse(zip_bytes, content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            response['X-Export-Filename'] = filename
            return response
        except Exception as e:
            logger.error(f'Export failed: {e}')
            return Response(
                {'error': 'Export fehlgeschlagen.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
