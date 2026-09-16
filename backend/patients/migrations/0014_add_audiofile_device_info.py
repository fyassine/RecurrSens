from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0013_backfill_patient_access_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='audiofile',
            name='device_info',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Erfasste Geräte-, Browser- und Mikrofondaten zum Aufnahmezeitpunkt',
                verbose_name='Geräteinformationen',
            ),
        ),
    ]
