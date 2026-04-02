"""
Django Admin configuration for the patients app.
Provides a rich admin interface for managing patients, audio files, and exercises.
"""
from django.contrib import admin
from .models import Patient, AudioFile, Exercise


class AudioFileInline(admin.TabularInline):
    """Inline display of audio files on the Patient admin page."""
    model = AudioFile
    extra = 0
    readonly_fields = ('id', 'storage_key', 'created_at')
    fields = ('exercise_id', 'phase', 'storage_key', 'created_at')


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    """Admin configuration for Patient model."""
    list_display = (
        'patient_id', 'status', 'gender', 'birth_date',
        'diagnosis', 'prediction_pre', 'prediction_post',
        'audio_count_pre', 'audio_count_post',
        'created_at',
    )
    list_filter = ('status', 'gender', 'diagnosis', 'prediction_pre', 'prediction_post')
    search_fields = ('patient_id', 'diagnosis_text')
    readonly_fields = ('id', 'created_at', 'updated_at')
    ordering = ('-created_at',)

    fieldsets = (
        ('Identifikation', {
            'fields': ('id', 'patient_id', 'status')
        }),
        ('Demografie', {
            'fields': ('gender', 'birth_date')
        }),
        ('Diagnose', {
            'fields': ('diagnosis', 'diagnosis_text')
        }),
        ('Prä-OP KI-Ergebnisse', {
            'fields': (
                'pre_op_date', 'prediction_pre',
                'ai_percentage_rp_pre', 'gradcam_prediction_pre',
                'gradcam_percentage_pre', 'ai_reasoning_pre',
            ),
            'classes': ('collapse',),
        }),
        ('Post-OP KI-Ergebnisse', {
            'fields': (
                'post_op_date', 'prediction_post',
                'ai_percentage_rp_post', 'gradcam_prediction_post',
                'gradcam_percentage_post', 'ai_reasoning_post',
            ),
            'classes': ('collapse',),
        }),
        ('Zeitstempel', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    inlines = [AudioFileInline]

    def audio_count_pre(self, obj):
        return obj.audio_files.filter(phase='PRE_OP').count()
    audio_count_pre.short_description = 'Prä-OP Aufnahmen'

    def audio_count_post(self, obj):
        return obj.audio_files.filter(phase='POST_OP').count()
    audio_count_post.short_description = 'Post-OP Aufnahmen'


@admin.register(AudioFile)
class AudioFileAdmin(admin.ModelAdmin):
    """Admin configuration for AudioFile model."""
    list_display = ('patient', 'exercise_id', 'phase', 'storage_key', 'created_at')
    list_filter = ('phase', 'exercise_id')
    search_fields = ('patient__patient_id', 'exercise_id', 'storage_key')
    readonly_fields = ('id', 'created_at')
    raw_id_fields = ('patient',)


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    """Admin configuration for Exercise model."""
    list_display = ('exercise_id', 'title', 'order', 'is_active')
    list_filter = ('is_active',)
    list_editable = ('order', 'is_active')
    ordering = ('order',)


# Customize admin site branding
admin.site.site_header = 'Recurrensparese Diagnose — Administration'
admin.site.site_title = 'Recurrensparese Admin'
admin.site.index_title = 'Verwaltung'
