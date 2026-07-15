from django.db import migrations


def backfill_access_codes(apps, schema_editor):
    from patients.models import generate_access_code

    Patient = apps.get_model('patients', 'Patient')
    existing_codes = set(Patient.objects.exclude(access_code=None).values_list('access_code', flat=True))

    for patient in Patient.objects.filter(access_code=None):
        code = generate_access_code()
        while code in existing_codes:
            code = generate_access_code()
        existing_codes.add(code)
        patient.access_code = code
        patient.save(update_fields=['access_code'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0012_patient_access_code'),
    ]

    operations = [
        migrations.RunPython(backfill_access_codes, noop_reverse),
    ]
