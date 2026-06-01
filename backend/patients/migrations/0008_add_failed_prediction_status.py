from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0007_seed_mri_center'),
    ]

    operations = [
        migrations.AlterField(
            model_name='patient',
            name='prediction_pre',
            field=models.CharField(
                choices=[
                    ('TODO', 'Ausstehend'),
                    ('INFECTED', 'Pathologisch'),
                    ('HEALTHY', 'Gesund'),
                    ('FAILED', 'Fehlgeschlagen'),
                ],
                default='TODO',
                max_length=10,
                verbose_name='KI-Vorhersage (Prä-OP)',
            ),
        ),
        migrations.AlterField(
            model_name='patient',
            name='prediction_post',
            field=models.CharField(
                choices=[
                    ('TODO', 'Ausstehend'),
                    ('INFECTED', 'Pathologisch'),
                    ('HEALTHY', 'Gesund'),
                    ('FAILED', 'Fehlgeschlagen'),
                ],
                default='TODO',
                max_length=10,
                verbose_name='KI-Vorhersage (Post-OP)',
            ),
        ),
    ]
