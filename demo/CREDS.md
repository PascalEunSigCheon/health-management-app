# Demo accounts

> Default password for all demo accounts: **HealthPass!1** (update after first login).

## Doctors

The simplified app seeds at least two doctors for each specialty.  All doctors share the same default password above.  Languages are no longer stored or displayed.

| Email | Name | Specialty | City |
| --- | --- | --- | --- |
| cardio.demo1@example.com | Alice Heart | Cardiology | Paris |
| cardio.demo2@example.com | Bernard Pulse | Cardiology | Lyon |
| derm.demo1@example.com | Clara Skin | Dermatology | Marseille |
| derm.demo2@example.com | David Derm | Dermatology | Nice |
| general.demo1@example.com | Eva Med | General Medicine | Toulouse |
| general.demo2@example.com | Frank Health | General Medicine | Paris |
| pulmo.demo1@example.com | Grace Lung | Pulmonology | Lyon |
| pulmo.demo2@example.com | Hector Breath | Pulmonology | Marseille |
| gastro.demo1@example.com | Isabelle Gut | Gastroenterology | Nice |
| gastro.demo2@example.com | Jean Digest | Gastroenterology | Toulouse |
| ortho.demo1@example.com | Katerina Bone | Orthopedics | Paris |
| ortho.demo2@example.com | Leo Joint | Orthopedics | Lyon |
| neuro.demo1@example.com | Marta Brain | Neurology | Marseille |
| neuro.demo2@example.com | Nicolas Nerve | Neurology | Nice |
| peds.demo1@example.com | Olivia Child | Pediatrics | Toulouse |
| peds.demo2@example.com | Pierre Youth | Pediatrics | Paris |
| oph.demo1@example.com | Quentin Eye | Ophthalmology | Lyon |
| oph.demo2@example.com | Rachelle Vision | Ophthalmology | Marseille |
| ent.demo1@example.com | Samuel Ear | ENT | Nice |
| ent.demo2@example.com | Therese Throat | ENT | Toulouse |

## Patients

| Email | Name |
| --- | --- |
| patient.one@example.com | Pat One |
| patient.two@example.com | Pat Two |
| patient.demo@example.com | Pat Demo |

> Use AWS CLI `admin-create-user` with `--temporary-password HealthPass!1` followed by `admin-set-user-password --permanent` to provision these demo credentials, or follow the README seeding guide.
