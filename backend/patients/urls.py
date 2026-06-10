"""
URL patterns for the patients app.

Routes are organized into three groups:
1. Admin endpoints (/api/patients/...) — JWT required
2. Patient-facing endpoints (/api/p/{token}/...) — UUID token auth
3. Public endpoints (/api/exercises/, /api/audio/...) — no auth
4. Export (/api/export/) — JWT required
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

app_name = 'patients'

# Admin patient CRUD via DRF router
router = DefaultRouter()
router.register(r'patients', views.PatientViewSet, basename='patient')

urlpatterns = [
    # =========================================================================
    # Admin endpoints (JWT)
    # =========================================================================
    path('', include(router.urls)),

    # =========================================================================
    # Patient-facing endpoints (UUID token)
    # =========================================================================
    path(
        'p/<uuid:token>/',
        views.PatientPublicView.as_view(),
        name='patient-public',
    ),
    path(
        'p/<uuid:token>/advance/',
        views.PatientPublicAdvanceView.as_view(),
        name='patient-public-advance',
    ),
    path(
        'p/<uuid:token>/feedback/',
        views.PatientFeedbackView.as_view(),
        name='patient-feedback',
    ),
    path(
        'p/<uuid:token>/skips/',
        views.ExerciseSkipView.as_view(),
        name='exercise-skip',
    ),
    path(
        'p/<uuid:token>/audio/upload/',
        views.AudioUploadView.as_view(),
        name='audio-upload',
    ),
    path(
        'p/<uuid:token>/audio/presign/',
        views.AudioPresignView.as_view(),
        name='audio-presign',
    ),
    path(
        'p/<uuid:token>/audio/confirm/',
        views.AudioPresignConfirmView.as_view(),
        name='audio-presign-confirm',
    ),

    # =========================================================================
    # Audio streaming & download (public / JWT)
    # =========================================================================
    path(
        'audio/<uuid:file_id>/reassign/',
        views.AudioFileReassignView.as_view(),
        name='audio-reassign',
    ),
    path(
        'audio/<uuid:file_id>/',
        views.AudioStreamView.as_view(),
        name='audio-stream',
    ),
    path(
        'audio/<uuid:file_id>/stream-url/',
        views.AudioStreamUrlView.as_view(),
        name='audio-stream-url',
    ),
    path(
        'audio/<uuid:file_id>/url/',
        views.AudioDownloadUrlView.as_view(),
        name='audio-download-url',
    ),

    # =========================================================================
    # Exercises (public)
    # =========================================================================
    path(
        'exercises/',
        views.ExerciseListView.as_view(),
        name='exercise-list',
    ),

    # =========================================================================
    # Export (SUPER_ADMIN only)
    # =========================================================================
    path(
        'export/',
        views.ExportView.as_view(),
        name='export',
    ),

    # =========================================================================
    # Current user info (JWT)
    # =========================================================================
    path(
        'me/',
        views.MeView.as_view(),
        name='me',
    ),
    path(
        'me/account/',
        views.AccountInfoView.as_view(),
        name='me-account',
    ),
]
