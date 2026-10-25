# Generated migration for automatic attendance

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClassSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('day_of_week', models.IntegerField(choices=[(1, 'Monday'), (2, 'Tuesday'), (3, 'Wednesday'), (4, 'Thursday'), (5, 'Friday'), (6, 'Saturday'), (7, 'Sunday')])),
                ('start_time', models.TimeField()),
                ('end_time', models.TimeField()),
                ('room', models.CharField(blank=True, max_length=50)),
                ('teacher_assignment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='schedules', to='core.teacherassignment')),
            ],
            options={
                'ordering': ['day_of_week', 'start_time'],
                'unique_together': {('teacher_assignment', 'day_of_week', 'start_time')},
            },
        ),
        migrations.AddField(
            model_name='attendancesession',
            name='schedule',
            field=models.ForeignKey(blank=True, help_text='The schedule entry that generated this session', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='attendance_sessions', to='core.classschedule'),
        ),
        migrations.AddField(
            model_name='attendancesession',
            name='status',
            field=models.CharField(choices=[('not_started', 'Not Started'), ('in_progress', 'In Progress'), ('completed', 'Completed')], default='not_started', max_length=20),
        ),
        migrations.AlterUniqueTogether(
            name='attendancesession',
            unique_together={('teacher_assignment', 'date', 'schedule')},
        ),
        migrations.AlterModelOptions(
            name='attendancesession',
            options={'ordering': ['-date', 'schedule__start_time']},
        ),
    ]
