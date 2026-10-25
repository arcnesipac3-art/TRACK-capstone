# Fix unique constraints for scheduled vs manual sessions

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_auto_attendance'),
    ]

    operations = [
        # Remove old unique_together
        migrations.AlterUniqueTogether(
            name='attendancesession',
            unique_together=set(),
        ),
        # Add new constraints
        migrations.AddConstraint(
            model_name='attendancesession',
            constraint=models.UniqueConstraint(
                condition=models.Q(('schedule__isnull', False)),
                fields=('teacher_assignment', 'date', 'schedule'),
                name='unique_scheduled_session'
            ),
        ),
        migrations.AddConstraint(
            model_name='attendancesession',
            constraint=models.UniqueConstraint(
                condition=models.Q(('schedule__isnull', True)),
                fields=('teacher_assignment', 'date'),
                name='unique_manual_session'
            ),
        ),
    ]
