"""
Django Admin configuration for the patients app.
Provides a rich admin interface for managing patients, audio files, exercises, and sessions.
"""

from django.contrib import admin

from . import services
from .models import (
    AudioFile,
    Center,
    Exercise,
    ExerciseSkip,
    LoginHistory,
    Patient,
    PatientAuditLog,
    PatientFeedback,
    RecordingSession,
    UserProfile,
)


class AudioFileInline(admin.TabularInline):
    """Inline display of audio files on the Patient admin page."""

    model = AudioFile
    extra = 0
    readonly_fields = ('id', 'storage_key', 'created_at')
    fields = ('exercise_id', 'phase', 'session', 'storage_key', 'created_at')


class RecordingSessionInline(admin.TabularInline):
    """Inline display of recording sessions on the Patient admin page."""

    model = RecordingSession
    extra = 0
    readonly_fields = ('id', 'phase', 'session_number', 'created_at')
    fields = ('phase', 'session_number', 'created_at', 'visit_date')


@admin.action(description='Audiodaten löschen (Soft Delete)')
def soft_delete_patients(modeladmin, request, queryset):
    """Soft-delete selected patients: remove audio data, keep metadata."""
    for patient in queryset.filter(deleted_at__isnull=True):
        services.delete_patient_with_files(patient)


@admin.action(description='Neue POST_OP Sitzung erstellen')
def create_postop_session(modeladmin, request, queryset):
    """Create a new POST_OP recording session for selected patients."""
    for patient in queryset:
        services.create_recording_session(patient, 'POST_OP')


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    """Admin configuration for Patient model."""

    list_display = (
        'patient_id',
        'center',
        'status',
        'prediction_pre',
        'prediction_post',
        'audio_count_pre',
        'audio_count_post',
        'session_count',
        'is_soft_deleted',
        'expires_at',
        'created_at',
    )
    list_filter = ('status', 'prediction_pre', 'prediction_post', 'deleted_at', 'center')
    search_fields = ('patient_id',)
    readonly_fields = ('id', 'created_at', 'updated_at', 'notification_sent_at', 'deleted_at')
    ordering = ('-created_at',)
    actions = [soft_delete_patients, create_postop_session]

    fieldsets = (
        ('Identifikation', {'fields': ('id', 'patient_id', 'center', 'status')}),
        (
            'Datenschutz',
            {
                'fields': ('expires_at', 'notification_sent_at', 'deleted_at'),
            },
        ),
        (
            'Prä-OP KI-Ergebnisse',
            {
                'fields': (
                    'pre_op_date',
                    'prediction_pre',
                    'ai_percentage_rp_pre',
                    'gradcam_prediction_pre',
                    'gradcam_percentage_pre',
                    'ai_reasoning_pre',
                ),
                'classes': ('collapse',),
            },
        ),
        (
            'Post-OP KI-Ergebnisse',
            {
                'fields': (
                    'post_op_date',
                    'prediction_post',
                    'ai_percentage_rp_post',
                    'gradcam_prediction_post',
                    'gradcam_percentage_post',
                    'ai_reasoning_post',
                ),
                'classes': ('collapse',),
            },
        ),
        (
            'Zeitstempel',
            {
                'fields': ('created_at', 'updated_at'),
                'classes': ('collapse',),
            },
        ),
    )

    inlines = [RecordingSessionInline, AudioFileInline]

    def audio_count_pre(self, obj):
        return obj.audio_files.filter(phase='PRE_OP').count()

    audio_count_pre.short_description = 'Prä-OP'

    def audio_count_post(self, obj):
        return obj.audio_files.filter(phase='POST_OP').count()

    audio_count_post.short_description = 'Post-OP'

    def session_count(self, obj):
        return obj.sessions.count()

    session_count.short_description = 'Sitzungen'

    def is_soft_deleted(self, obj):
        return obj.deleted_at is not None

    is_soft_deleted.boolean = True
    is_soft_deleted.short_description = 'Gelöscht'


@admin.register(RecordingSession)
class RecordingSessionAdmin(admin.ModelAdmin):
    """Admin configuration for RecordingSession model."""

    list_display = ('patient', 'phase', 'session_number', 'created_at', 'visit_date')
    list_filter = ('phase',)
    search_fields = ('patient__patient_id',)
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('patient',)


@admin.register(AudioFile)
class AudioFileAdmin(admin.ModelAdmin):
    """Admin configuration for AudioFile model."""

    list_display = ('patient', 'exercise_id', 'phase', 'session', 'storage_key', 'created_at')
    list_filter = ('phase', 'exercise_id')
    search_fields = ('patient__patient_id', 'exercise_id', 'storage_key')
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('patient', 'session')


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    """Admin configuration for Exercise model."""

    list_display = ('exercise_id', 'title', 'order', 'is_active')
    list_filter = ('is_active',)
    list_editable = ('order', 'is_active')
    ordering = ('order',)


@admin.register(PatientFeedback)
class PatientFeedbackAdmin(admin.ModelAdmin):
    """Admin configuration for patient feedback entries."""

    list_display = ('patient', 'phase', 'rating', 'skipped', 'created_at')
    list_filter = ('phase', 'skipped')
    search_fields = ('patient__patient_id',)
    readonly_fields = ('id', 'created_at', 'updated_at')
    ordering = ('-created_at',)
    raw_id_fields = ('patient',)


@admin.register(ExerciseSkip)
class ExerciseSkipAdmin(admin.ModelAdmin):
    """Admin configuration for skipped exercises."""

    list_display = ('patient', 'phase', 'exercise_id', 'created_at')
    list_filter = ('phase',)
    search_fields = ('patient__patient_id', 'exercise_id')
    readonly_fields = ('id', 'created_at')
    ordering = ('-created_at',)
    raw_id_fields = ('patient',)


@admin.register(Center)
class CenterAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)
    readonly_fields = ('id', 'created_at')


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'center')
    list_filter = ('role', 'center')
    search_fields = ('user__username',)


@admin.register(LoginHistory)
class LoginHistoryAdmin(admin.ModelAdmin):
    list_display = ('user', 'ip_address', 'short_user_agent', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__username', 'ip_address')
    readonly_fields = ('user', 'ip_address', 'user_agent', 'created_at')
    ordering = ('-created_at',)

    def short_user_agent(self, obj):
        return (obj.user_agent[:60] + '…') if len(obj.user_agent) > 60 else obj.user_agent

    short_user_agent.short_description = 'User-Agent'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(PatientAuditLog)
class PatientAuditLogAdmin(admin.ModelAdmin):
    """Read-only audit log viewer."""

    list_display = ('patient', 'event_type', 'event', 'actor', 'actor_name', 'created_at')
    list_filter = ('event_type', 'actor', 'created_at')
    search_fields = ('patient__patient_id', 'event', 'actor_name')
    readonly_fields = (
        'id',
        'patient',
        'event_type',
        'event',
        'detail',
        'files',
        'actor',
        'actor_name',
        'created_at',
    )
    ordering = ('-created_at',)
    raw_id_fields = ('patient',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


# Customize admin site branding
admin.site.site_header = 'Recurrensparese Diagnose — Administration'
admin.site.site_title = 'Recurrensparese Admin'
admin.site.index_title = 'Verwaltung'
