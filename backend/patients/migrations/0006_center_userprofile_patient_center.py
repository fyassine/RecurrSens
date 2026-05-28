import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0005_exerciseskip_add_session'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Center',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200, unique=True, verbose_name='Zentrum')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Erstellt am')),
            ],
            options={
                'verbose_name': 'Zentrum',
                'verbose_name_plural': 'Zentren',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='UserProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(
                    choices=[('SUPER_ADMIN', 'Super Admin'), ('CENTER_USER', 'Zentrum-Benutzer')],
                    default='SUPER_ADMIN',
                    max_length=20,
                    verbose_name='Rolle',
                )),
                ('center', models.ForeignKey(
                    blank=True,
                    help_text='Pflichtfeld für CENTER_USER; leer für SUPER_ADMIN',
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='users',
                    to='patients.center',
                    verbose_name='Zentrum',
                )),
                ('user', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='profile',
                    to=settings.AUTH_USER_MODEL,
                    verbose_name='Benutzer',
                )),
            ],
            options={
                'verbose_name': 'Benutzerprofil',
                'verbose_name_plural': 'Benutzerprofile',
            },
        ),
        migrations.AddField(
            model_name='patient',
            name='center',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='patients',
                to='patients.center',
                verbose_name='Zentrum',
            ),
        ),
    ]
