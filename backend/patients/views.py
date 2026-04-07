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

from django.http import HttpResponse, StreamingHttpResponse
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Patient, AudioFile, Exercise
from .serializers import (
    PatientListSerializer,
    PatientDetailSerializer,
    PatientPublicSerializer,
    PatientCreateSerializer,
    PatientUpdateSerializer,
    ExerciseSerializer,
    AudioFileSerializer,
    CompletenessSerializer,
)
from .permissions import IsAdminUser, IsPatientTokenValid, IsAdminOrPatientToken
from . import services

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
            patient = Patient.objects.prefetch_related('audio_files').get(id=token)
        except Patient.DoesNotExist:
            return Response(
                {'error': 'Patient nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = PatientPublicSerializer(patient)
        return Response(serializer.data)

    def patch(self, request, token):
        """Update patient demographics (gender, birth_date, etc.)."""
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
            Patient.Status.DEMOGRAPHICS_DONE,
        ]
        allowed_fields = {'gender', 'birth_date', 'diagnosis', 'diagnosis_text'}

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

        # Determine phase from patient status
        is_post_op = patient.status in (
            Patient.Status.POST_OP_STARTED,
            Patient.Status.POST_OP_DONE,
        )
        phase = 'POST_OP' if is_post_op else 'PRE_OP'
        phase_folder = 'post' if is_post_op else 'pre'

        # Build storage key
        extension = file.name.split('.')[-1] if '.' in file.name else 'wav'
        key = f'{token}/{phase_folder}/{exercise_id}.{extension}'

        # Upload to S3
        try:
            file_data = file.read()
            services.upload_audio_to_s3(file_data, key, file.content_type)
        except Exception as e:
            logger.error(f'S3 upload failed for {key}: {e}')
            return Response(
                {'error': 'Datei-Upload fehlgeschlagen.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Create DB record
        try:
            audio_file = AudioFile.objects.create(
                patient=patient,
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

        # Determine extension from content type
        ext_map = {
            'audio/webm': 'webm',
            'audio/wav': 'wav',
            'audio/mpeg': 'mp3',
            'audio/ogg': 'ogg',
            'audio/mp4': 'm4a',
        }
        extension = ext_map.get(content_type, 'webm')
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
    """Export completed patient data as a ZIP file."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            zip_bytes = services.export_patients_zip()
            today = datetime.now().strftime('%Y-%m-%d')
            response = HttpResponse(zip_bytes, content_type='application/zip')
            response['Content-Disposition'] = (
                f'attachment; filename="patienten_export_{today}.zip"'
            )
            return response
        except Exception as e:
            logger.error(f'Export failed: {e}')
            return Response(
                {'error': 'Export fehlgeschlagen.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
