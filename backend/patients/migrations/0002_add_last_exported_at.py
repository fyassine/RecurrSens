from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='patient',
            name='last_exported_at',
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name='Zuletzt exportiert am',
                help_text='Zeitpunkt des letzten ZIP-Exports; Pflichtbedingung für automatische Löschung',
            ),
        ),
    ]
