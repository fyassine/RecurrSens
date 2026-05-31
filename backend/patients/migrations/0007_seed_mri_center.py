from django.db import migrations


def seed_mri(apps, schema_editor):
    Center = apps.get_model('patients', 'Center')
    UserProfile = apps.get_model('patients', 'UserProfile')
    Patient = apps.get_model('patients', 'Patient')
    User = apps.get_model('auth', 'User')

    center, _ = Center.objects.get_or_create(name='MRI')

    Patient.objects.filter(center__isnull=True).update(center=center)

    for user in User.objects.all():
        UserProfile.objects.get_or_create(
            user=user,
            defaults={'role': 'SUPER_ADMIN', 'center': center},
        )


def unseed_mri(apps, schema_editor):
    Center = apps.get_model('patients', 'Center')
    UserProfile = apps.get_model('patients', 'UserProfile')
    Patient = apps.get_model('patients', 'Patient')

    try:
        center = Center.objects.get(name='MRI')
    except Center.DoesNotExist:
        return

    Patient.objects.filter(center=center).update(center=None)
    UserProfile.objects.filter(center=center).delete()
    center.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0006_center_userprofile_patient_center'),
    ]

    operations = [
        migrations.RunPython(seed_mri, reverse_code=unseed_mri),
    ]
