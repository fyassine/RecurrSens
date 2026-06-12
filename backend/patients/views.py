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
        POST   /api/patients/{token}/sessions/ Create a new recording session
        PATCH  /api/patients/{token}/sessions/{session_id}/  Update a recording session's visit date
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
from django.http import HttpResponse
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from . import services
from .audio_validation import (
    ALLOWED_EXTENSIONS,
    extension_for_content_type,
    validate_audio_upload,
)
from .models import (
    AudioFile,
    Exercise,
    ExerciseSkip,
    Patient,
    PatientAuditLog,
    PatientFeedback,
    RecordingSession,
)
from .permissions import (
    IsAdminOrPatientToken,
    IsPatientTokenValid,
    IsSuperAdmin,
    _get_center,
    _get_role,
)
from .serializers import (
    CompletenessSerializer,
    ExerciseSerializer,
    ExerciseSkipCreateSerializer,
    ExerciseSkipSerializer,
    PatientCreateSerializer,
    PatientDetailSerializer,
    PatientFeedbackCreateSerializer,
    PatientFeedbackSerializer,
    PatientListSerializer,
    PatientPublicSerializer,
    PatientUpdateSerializer,
    RecordingSessionSerializer,
    RecordingSessionVisitDateSerializer,
)

logger = logging.getLogger(__name__)


def _audio_for_user(user, file_id):
    """Return the AudioFile if *user* may access it, else None.

    SUPER_ADMIN may access every file; a CENTER_USER is restricted to files
    belonging to patients in their own center. Returning None lets callers
    respond with 404 without leaking whether the file exists in another center.
    """
    qs = AudioFile.objects.select_related('patient')
    if _get_role(user) == 'CENTER_USER':
        center = _get_center(user)
        if center is None:
            return None
        qs = qs.filter(patient__center=center)
    try:
        return qs.get(id=file_id)
    except AudioFile.DoesNotExist:
        return None


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
        qs = Patient.objects.prefetch_related('audio_files', 'feedback_entries', 'exercise_skips').all()
        if _get_role(self.request.user) == 'CENTER_USER':
            center = _get_center(self.request.user)
            if center is None:
                return Patient.objects.none()
            return qs.filter(center=center)
        return qs

    def perform_create(self, serializer):
        # Pop write-only flag before passing validated data to save()
        start_post_op = serializer.validated_data.pop('start_post_op', False)

        if _get_role(self.request.user) == 'CENTER_USER':
            patient = serializer.save(center=_get_center(self.request.user))
        else:
            patient = serializer.save()

        if start_post_op:
            services.init_post_op_patient(patient)

    def destroy(self, request, *args, **kwargs):
        if _get_role(request.user) != 'SUPER_ADMIN':
            return Response(
                {'error': 'Nur Super-Admins dürfen Patienten löschen.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

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
            # ValueError carries a deliberate, user-facing validation message.
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

    @action(detail=True, methods=['patch'], url_path=r'sessions/(?P<session_id>[^/.]+)')
    def update_session(self, request, pk=None, session_id=None):
        """Update a recording session's visit date (admin only)."""
        patient = self.get_object()
        try:
            session = patient.sessions.get(pk=session_id)
        except RecordingSession.DoesNotExist:
            return Response({'error': 'Sitzung nicht gefunden.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = RecordingSessionVisitDateSerializer(session, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        old_visit_date = session.visit_date
        serializer.save()

        if session.visit_date != old_visit_date:
            try:
                old_str = old_visit_date.strftime('%d.%m.%Y') if old_visit_date else '–'
                new_str = session.visit_date.strftime('%d.%m.%Y') if session.visit_date else '–'
                PatientAuditLog.objects.create(
                    patient=patient,
                    event_type=PatientAuditLog.EventType.EDIT,
                    event='Besuchsdatum bearbeitet',
                    detail=f'Follow-up {session.session_number - 1}: {old_str} → {new_str}',
                    files=[],
                    actor=PatientAuditLog.Actor.ADMIN,
                    actor_name=getattr(request.user, 'username', 'admin'),
                )
            except Exception:
                logger.exception('Failed to write visit_date audit log for session %s', session.id)

        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='activity')
    def activity(self, request, pk=None):
        """
        Return a list of activity events for the patient timeline.

        Combines database audit log entries (PatientAuditLog) with filtered
        synthesised legacy events (for actions preceding the first audit log entry,
        or for de-duplicating patient creation/expiry).
        """
        import uuid as _uuid

        patient = self.get_object()

        # Retrieve real database audit logs
        audit_qs = (
            PatientAuditLog.objects
            .filter(patient=patient)
            .order_by('-created_at')
        )

        db_events = [
            {
                'id': str(entry.id),
                'type': entry.event_type,
                'event': entry.event,
                'detail': entry.detail,
                'files': entry.files,
                'actor': entry.actor,
                'actor_name': entry.actor_name,
                'timestamp': entry.created_at.isoformat(),
            }
            for entry in audit_qs
        ]

        db_event_types = {entry.event_type for entry in audit_qs}
        earliest_db_ts = min(entry.created_at for entry in audit_qs) if audit_qs.exists() else None

        fallback_events = []

        # 1. Patient creation (if not already logged in DB)
        if 'create' not in db_event_types:
            fallback_events.append({
                'id': f'create-{patient.id}',
                'type': 'create',
                'event': 'Patient angelegt',
                'detail': 'Neuer Patienteneintrag erstellt',
                'files': [],
                'actor': 'admin',
                'actor_name': 'admin',
                'timestamp': patient.created_at,
            })

        # 2. Audio file uploads (preceding the earliest DB log)
        from collections import defaultdict
        audio_files = (
            patient.audio_files
            .select_related('session')
            .order_by('created_at')
        )
        upload_groups = defaultdict(list)
        for af in audio_files:
            day_key = af.created_at.date().isoformat()
            upload_groups[(af.phase, day_key)].append(af)

        for (phase, day_key), files in upload_groups.items():
            group_ts = min(af.created_at for af in files)
            if earliest_db_ts and group_ts >= earliest_db_ts:
                continue
            phase_label = 'Prä-OP' if phase == 'PRE_OP' else 'Post-OP'
            count = len(files)
            file_labels = [
                f'Aufnahme {i + 1}' + (f' [{af.exercise_id.upper()}]' if af.exercise_id else '')
                for i, af in enumerate(files)
            ]
            fallback_events.append({
                'id': f'upload-{phase}-{day_key}-{_uuid.uuid4().hex[:6]}',
                'type': 'upload',
                'event': f'{phase_label} Aufnahmen hochgeladen',
                'detail': f'{count} Aufnahme{"n" if count != 1 else ""} hinzugefügt',
                'files': file_labels,
                'actor': 'patient',
                'actor_name': f'{patient.patient_id} (Patient)',
                'timestamp': group_ts,
            })

        # 3. Last export (preceding the earliest DB log)
        if patient.last_exported_at:
            if not earliest_db_ts or patient.last_exported_at < earliest_db_ts:
                fallback_events.append({
                    'id': f'export-{patient.id}',
                    'type': 'export',
                    'event': 'Patientendaten exportiert',
                    'detail': 'Vollständiger Datenexport (ZIP)',
                    'files': [],
                    'actor': 'admin',
                    'actor_name': 'admin',
                    'timestamp': patient.last_exported_at,
                })

        # 4. Scheduled expiry (if not already logged in DB)
        if 'expiry' not in db_event_types:
            fallback_events.append({
                'id': f'expiry-{patient.id}',
                'type': 'expiry',
                'event': 'Automatische Ablaufmarkierung geplant',
                'detail': f'Datensatz zum Löschen vorgemerkt (Ablauf: {patient.expires_at.strftime("%d.%m.%Y")})',
                'files': [],
                'actor': 'system',
                'actor_name': 'System',
                'timestamp': patient.created_at,
            })

        # 5. Soft deletion (preceding the earliest DB log)
        if patient.deleted_at:
            if not earliest_db_ts or patient.deleted_at < earliest_db_ts:
                fallback_events.append({
                    'id': f'delete-{patient.id}',
                    'type': 'delete',
                    'event': 'Patient gelöscht',
                    'detail': 'Audiodaten wurden entfernt (Soft-Löschung)',
                    'files': [],
                    'actor': 'admin',
                    'actor_name': 'admin',
                    'timestamp': patient.deleted_at,
                })

        # Format timestamps to ISO strings for fallback events
        for e in fallback_events:
            e['timestamp'] = e['timestamp'].isoformat()

        combined_events = db_events + fallback_events
        combined_events.sort(key=lambda e: e['timestamp'], reverse=True)
        return Response(combined_events, status=status.HTTP_200_OK)


# =============================================================================
# Patient-Facing Views (UUID token auth, no JWT)
# =============================================================================

class PatientPublicView(APIView):
    """
    Patient-facing endpoint accessed via UUID token in the URL.
    Read-only: workflow transitions go through PatientPublicAdvanceView so the
    state machine (and its side effects) are never bypassed.
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

        try:
            phase_label = 'Prä-OP' if data['phase'] == 'PRE_OP' else 'Post-OP'
            if feedback.skipped:
                detail_str = f'Feedback für {phase_label} übersprungen'
            else:
                rating_val = feedback.rating
                detail_str = f'Bewertung: {rating_val}/5 Sterne'
                if feedback.comment:
                    comment_trunc = (feedback.comment[:60] + '...') if len(feedback.comment) > 63 else feedback.comment
                    detail_str += f' — "{comment_trunc}"'
            
            PatientAuditLog.objects.create(
                patient=patient,
                event_type=PatientAuditLog.EventType.EDIT,
                event='Feedback eingereicht' if created else 'Feedback aktualisiert',
                detail=detail_str,
                files=[],
                actor=PatientAuditLog.Actor.PATIENT,
                actor_name=f'{patient.patient_id} (Patient)',
            )
        except Exception:
            logger.exception('Failed to write patient feedback audit log for patient %s', patient.id)

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

        if created:
            try:
                exercise = Exercise.objects.filter(exercise_id=data['exercise_id']).first()
                exercise_title = exercise.title if exercise else data['exercise_id']
                phase_label = 'Prä-OP' if data['phase'] == 'PRE_OP' else 'Post-OP'
                
                PatientAuditLog.objects.create(
                    patient=patient,
                    event_type=PatientAuditLog.EventType.EDIT,
                    event='Übung übersprungen',
                    detail=f'Übung {exercise_title} übersprungen — {phase_label}',
                    files=[],
                    actor=PatientAuditLog.Actor.PATIENT,
                    actor_name=f'{patient.patient_id} (Patient)',
                )
            except Exception:
                logger.exception('Failed to write exercise skip audit log for patient %s', patient.id)

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
    throttle_scope = 'audio_upload'

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

        if not Exercise.objects.filter(exercise_id=exercise_id).exists():
            return Response(
                {'error': f'Unbekannte Übung: {exercise_id}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            extension, content_type = validate_audio_upload(file)
        except ValidationError as e:
            return Response(
                {'error': e.message if hasattr(e, 'message') else str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session_id = request.data.get('session_id')

        if session_id:
            # Admin uploading into a specific recording session (e.g. a
            # particular follow-up card) — derive phase from the session
            # itself rather than the patient's overall status.
            try:
                session = RecordingSession.objects.get(id=session_id, patient=patient)
            except RecordingSession.DoesNotExist:
                return Response(
                    {'error': 'Sitzung nicht gefunden.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            phase = session.phase
            phase_folder = 'post' if phase == 'POST_OP' else 'pre'
        else:
            # Patient wizard flow — derive phase from patient status and
            # target the currently active session for that phase.
            is_post_op = patient.status in (
                Patient.Status.POST_OP_STARTED,
                Patient.Status.POST_OP_DONE,
            )
            phase = 'POST_OP' if is_post_op else 'PRE_OP'
            phase_folder = 'post' if is_post_op else 'pre'
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

        # Replace any existing record for this exercise/phase/session before creating the new one.
        AudioFile.objects.filter(
            patient=patient,
            exercise_id=exercise_id,
            phase=phase,
            session=session,
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
    throttle_scope = 'audio_upload'

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

        if not Exercise.objects.filter(exercise_id=exercise_id).exists():
            return Response(
                {'error': f'Unbekannte Übung: {exercise_id}.'},
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

        # Verify the client actually uploaded the object before creating the DB
        # record. Without this, a client could confirm phantom files that break
        # export and completeness checks.
        if not services.audio_object_exists(storage_key):
            return Response(
                {'error': 'Datei wurde nicht in S3 gefunden.'},
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
    Requires JWT (admin only).

    The S3 object is physically moved (copy + delete) to a new key that
    reflects the new phase/session, and the DB record's storage_key, phase,
    and session fields are all updated atomically so that future exports and
    streaming always resolve to the correct file location.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, file_id):
        audio_file = _audio_for_user(request.user, file_id)
        if audio_file is None:
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

        # ------------------------------------------------------------------
        # Derive the new S3 storage key so the object location always matches
        # the phase/session stored in the DB.
        #
        # Key format (mirrors AudioUploadView):
        #   {patient_uuid}/pre/{exercise}.{ext}          ← PRE_OP, no session
        #   {patient_uuid}/pre_{n}/{exercise}.{ext}      ← PRE_OP, session n
        #   {patient_uuid}/post/{exercise}.{ext}         ← POST_OP, no session
        #   {patient_uuid}/post_{n}/{exercise}.{ext}     ← POST_OP, session n
        # ------------------------------------------------------------------
        old_key = audio_file.storage_key
        patient_uuid = str(audio_file.patient.id)
        ext = old_key.rsplit('.', 1)[-1] if '.' in old_key else 'webm'
        phase_prefix = 'pre' if new_phase == 'PRE_OP' else 'post'

        if new_session is not None:
            phase_folder = f'{phase_prefix}_{new_session.session_number}'
        else:
            phase_folder = phase_prefix

        new_key = f'{patient_uuid}/{phase_folder}/{audio_file.exercise_id}.{ext}'

        # Move the S3 object when the key changes
        if new_key != old_key:
            moved = services.move_audio_in_s3(old_key, new_key)
            if not moved:
                return Response(
                    {'error': 'Datei konnte nicht in S3 verschoben werden.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        audio_file.storage_key = new_key
        audio_file.phase = new_phase
        audio_file.session = new_session
        audio_file.save(update_fields=['storage_key', 'phase', 'session'])

        from .serializers import AudioFileCompactSerializer
        return Response(
            AudioFileCompactSerializer(audio_file).data,
            status=status.HTTP_200_OK,
        )


# =============================================================================
# Audio Streaming / Download
# =============================================================================

class AudioStreamUrlView(APIView):
    """Mint a short-lived signed URL for streaming an audio file.

    JWT required and center-scoped. The returned URL embeds a signed token that
    AudioStreamView validates, so native <audio> elements (which cannot send an
    Authorization header) can play the file without exposing it publicly.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, file_id):
        audio_file = _audio_for_user(request.user, file_id)
        if audio_file is None:
            return Response(
                {'error': 'Datei nicht gefunden.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        token = services.sign_audio_stream_token(audio_file.id)
        return Response({'url': f'/api/audio/{audio_file.id}/?t={token}'})


class AudioStreamView(APIView):
    """
    Proxy audio file from S3/MinIO for playback.
    Authorised via a short-lived signed token (query param `t`) minted by
    AudioStreamUrlView, since <audio> elements cannot send auth headers.
    """
    permission_classes = [AllowAny]

    def get(self, request, file_id):
        token = request.query_params.get('t', '')
        if not services.verify_audio_stream_token(file_id, token):
            return Response(
                {'error': 'Ungültiger oder abgelaufener Zugriffstoken.'},
                status=status.HTTP_403_FORBIDDEN,
            )

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
        audio_file = _audio_for_user(request.user, file_id)
        if audio_file is None:
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

class MeView(APIView):
    """Return the current user's role and center info."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = _get_role(request.user)
        center = _get_center(request.user)
        return Response({
            'username': request.user.username,
            'role': role,
            'center_id': str(center.id) if center else None,
            'center_name': center.name if center else None,
        })


class AccountInfoView(APIView):
    """Return full account info: profile, current session, and login history."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(services.get_account_info(request.user, request))


class ExportView(APIView):
    """Export patient data as a ZIP file.

    Query params:
        ids: Optional comma-separated list of patient UUIDs to export.
             When omitted, exports all completed patients.
    """
    permission_classes = [IsSuperAdmin]

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
                    patient = Patient.objects.get(id=patient_ids[0])
                    filename = f'{patient.patient_id}_export_{today}.zip'
                except Patient.DoesNotExist:
                    patient = None
                    filename = f'patienten_export_{today}.zip'
            else:
                patient = None
                filename = f'patienten_export_{today}.zip'

            response = HttpResponse(zip_bytes, content_type='application/zip')
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            response['X-Export-Filename'] = filename

            # Write audit log entries for all exported patients
            try:
                actor_name = request.user.username if request.user.is_authenticated else 'admin'
                exported_qs = (
                    Patient.objects.filter(id__in=patient_ids)
                    if patient_ids
                    else Patient.objects.all()
                )
                audit_entries = [
                    PatientAuditLog(
                        patient=p,
                        event_type=PatientAuditLog.EventType.EXPORT,
                        event='Patientendaten exportiert',
                        detail=f'Vollständiger Datenexport (ZIP) — {filename}',
                        files=[],
                        actor=PatientAuditLog.Actor.ADMIN,
                        actor_name=actor_name,
                    )
                    for p in exported_qs
                ]
                PatientAuditLog.objects.bulk_create(audit_entries, ignore_conflicts=True)
            except Exception:
                logger.exception('Failed to write export audit log entries')

            return response
        except Exception as e:
            logger.error(f'Export failed: {e}')
            return Response(
                {'error': 'Export fehlgeschlagen.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
