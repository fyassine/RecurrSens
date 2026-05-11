from django.db import migrations, models


def remap_legacy_statuses(apps, schema_editor):
    Patient = apps.get_model('patients', 'Patient')
    AudioFile = apps.get_model('patients', 'AudioFile')
    RecordingSession = apps.get_model('patients', 'RecordingSession')
    PatientFeedback = apps.get_model('patients', 'PatientFeedback')
    ExerciseSkip = apps.get_model('patients', 'ExerciseSkip')

    # COMPLETED no longer exists; map directly to the terminal workflow state.
    Patient.objects.filter(status='COMPLETED').update(status='POST_OP_DONE')

    # EXPIRED is no longer a workflow status. Reconstruct the most likely workflow
    # state from available timestamps and phase activity.
    post_activity_ids = set(
        AudioFile.objects.filter(phase='POST_OP').values_list('patient_id', flat=True)
    )
    post_activity_ids.update(
        RecordingSession.objects.filter(phase='POST_OP').values_list('patient_id', flat=True)
    )
    post_activity_ids.update(
        PatientFeedback.objects.filter(phase='POST_OP').values_list('patient_id', flat=True)
    )
    post_activity_ids.update(
        ExerciseSkip.objects.filter(phase='POST_OP').values_list('patient_id', flat=True)
    )

    pre_activity_ids = set(
        AudioFile.objects.filter(phase='PRE_OP').values_list('patient_id', flat=True)
    )
    pre_activity_ids.update(
        RecordingSession.objects.filter(phase='PRE_OP').values_list('patient_id', flat=True)
    )
    pre_activity_ids.update(
        PatientFeedback.objects.filter(phase='PRE_OP').values_list('patient_id', flat=True)
    )
    pre_activity_ids.update(
        ExerciseSkip.objects.filter(phase='PRE_OP').values_list('patient_id', flat=True)
    )

    Patient.objects.filter(status='EXPIRED', post_op_date__isnull=False).update(status='POST_OP_DONE')

    if post_activity_ids:
        Patient.objects.filter(status='EXPIRED', id__in=post_activity_ids).update(
            status='POST_OP_STARTED'
        )

    Patient.objects.filter(status='EXPIRED', pre_op_date__isnull=False).update(status='PRE_OP_DONE')

    if pre_activity_ids:
        Patient.objects.filter(status='EXPIRED', id__in=pre_activity_ids).update(
            status='CONSENT_GIVEN'
        )

    # Remaining EXPIRED records likely never started the recording flow.
    Patient.objects.filter(status='EXPIRED').update(status='NEW')


class Migration(migrations.Migration):
    dependencies = [
        ('patients', '0003_patient_feedback_and_exercise_skip'),
    ]

    operations = [
        migrations.RunPython(remap_legacy_statuses, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='patient',
            name='status',
            field=models.CharField(
                choices=[
                    ('NEW', 'Neu'),
                    ('CONSENT_GIVEN', 'Einwilligung erteilt'),
                    ('PRE_OP_DONE', 'Prä-OP abgeschlossen'),
                    ('POST_OP_STARTED', 'Post-OP begonnen'),
                    ('POST_OP_DONE', 'Post-OP abgeschlossen'),
                ],
                default='NEW',
                max_length=20,
                verbose_name='Status',
            ),
        ),
    ]
