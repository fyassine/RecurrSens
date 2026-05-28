# Center & User Management Guide

This guide explains how to create clinical centers (Zentren), create center-scoped users, and assign patients to centers.

---

## Role overview

| Role | Can see | Create patients | Advance status | Delete patients | Export / Download |
|---|---|---|---|---|---|
| **SUPER_ADMIN** | All patients across all centers | ✅ | ✅ | ✅ | ✅ |
| **CENTER_USER** | Only their own center's patients | ✅ | ✅ | ❌ | ❌ |

Users without a `UserProfile` row are treated as `SUPER_ADMIN` (backward-compatible with the existing superuser account).

---

## Step 1 — Open Django Admin

Navigate to **http://recurrsens.eu/admin/** and log in with your superuser account.

---

## Step 2 — Create a Center (Zentrum)

1. In the sidebar click **Patienten → Zentren → Zentrum hinzufügen**
2. Enter the center name (e.g. `MRI`, `Uniklinikum Leipzig`)
3. Click **Speichern**

> The center name is used as the display label everywhere and must be unique.

---

## Step 3 — Create a Django user for the center

1. Go to **Authentifizierung und Autorisierung → Benutzer → Benutzer hinzufügen**
2. Set a **username** and **password**, then click **Speichern und weiterbearbeiten**
3. On the detail page you can leave all permission checkboxes empty — permissions are controlled by the `UserProfile`, not by Django's built-in system

---

## Step 4 — Assign the user to a center and role

1. Go to **Patienten → Benutzerprofile → Benutzerprofil hinzufügen**
2. Select the **Benutzer** you just created
3. Set **Rolle** to `CENTER_USER`
4. Set **Zentrum** to the center you created in Step 2
5. Click **Speichern**

> A SUPER_ADMIN does not need a `UserProfile`. If you want to create an additional super admin, create a `UserProfile` with role `SUPER_ADMIN` and leave the center blank.

---

## Step 5 — Assign existing (legacy) patients to a center

Patients created before the center structure was introduced have `center = NULL` and are visible only to SUPER_ADMIN users. To make them visible to a CENTER_USER, assign them to a center.

### Option A — Management command (bulk, recommended for one-time migration)

Run inside the backend container:

```bash
docker compose exec backend python manage.py assign_center "MRI"
```

This assigns **all unassigned patients** (center = NULL) to the center named `MRI`.

Additional flags:

```bash
# Preview without saving
python manage.py assign_center "MRI" --dry-run

# Reassign ALL patients (even those already in another center)
python manage.py assign_center "MRI" --all
```

If the center name doesn't exist the command will list available centers and exit without modifying any data.

### Option B — Django Admin (individual or small groups)

1. Go to **Patienten → Patienten**
2. Use the **Zentrum** filter on the right sidebar to show patients with no center assigned (select the `---------` option)
3. Click a patient → edit the **Zentrum** field directly → **Speichern**

---

## Step 6 — Verify

Log in as the CENTER_USER account. You should see only the patients assigned to that center. The **Löschen** (delete) and **Exportieren** (export) buttons are hidden for CENTER_USER accounts — these actions are only available to SUPER_ADMIN.

---

## Summary checklist

- [ ] Create center in Django Admin → Zentren
- [ ] Create Django user (no special permissions needed)
- [ ] Create UserProfile linking user → center → role = CENTER_USER
- [ ] Assign legacy patients: `python manage.py assign_center "<center-name>"`
- [ ] Log in as the new user and verify patient visibility
