"""Household, state, invites, and meal image persistence."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from server.db import get_connection, json_dumps, json_loads

MEAL_IMAGE_MAX_BYTES = 900_000
SLOT_ORDER = ["u2", "u3", "u4", "u5", "u6", "u7", "u8"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def household_id_for_user(uid: str) -> str:
    return f"u_{uid}"


def _parse_household_row(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "members": json_loads(row["members_json"]) or [],
        "slots": json_loads(row["slots_json"]) or {},
        "profiles": json_loads(row["profiles_json"]) or {},
    }


def ensure_household_exists(household_id: str, uid: str) -> None:
    now = _now_iso()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM households WHERE id = ?", (household_id,)
        ).fetchone()
        if not row:
            conn.execute(
                """INSERT INTO households (id, members_json, slots_json, profiles_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    household_id,
                    json_dumps([uid]),
                    json_dumps({"u1": uid}),
                    json_dumps({uid: {"name": ""}}),
                    now,
                    now,
                ),
            )
            conn.commit()
            return

        meta = _parse_household_row(dict(row)) or {}
        members = [str(m) for m in meta.get("members", [])]
        slots = meta.get("slots", {})
        me = str(uid)
        in_members = me in members
        in_slots = any(str(slots.get(k) or "") == me for k in ["u1", *SLOT_ORDER])
        if in_members or in_slots:
            return

        if household_id != household_id_for_user(uid):
            raise ValueError(
                "Your account is not listed on this household. Sign out, use a fresh invite, or contact support."
            )

        profiles = meta.get("profiles", {})
        profiles[uid] = profiles.get(uid) or {"name": ""}
        conn.execute(
            """UPDATE households SET members_json = ?, slots_json = ?, profiles_json = ?, updated_at = ?
               WHERE id = ?""",
            (
                json_dumps([uid]),
                json_dumps({"u1": uid}),
                json_dumps(profiles),
                now,
                household_id,
            ),
        )
        conn.commit()


def load_user_household_id_from_profile(uid: str) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT household_id FROM users WHERE id = ?", (uid,)
        ).fetchone()
    if not row or not row["household_id"]:
        return None
    hid = str(row["household_id"]).strip()
    return hid or None


def load_household_meta(household_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM households WHERE id = ?", (household_id,)
        ).fetchone()
    return _parse_household_row(dict(row) if row else None)


def load_household_state(household_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT state_json FROM legacy_household_state WHERE household_id = ?",
            (household_id,),
        ).fetchone()
    if not row:
        return None
    return json_loads(row["state_json"])


def load_user_state(uid: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT state_json FROM user_state WHERE user_id = ?", (uid,)
        ).fetchone()
    if not row:
        return None
    return json_loads(row["state_json"])


def save_user_state(uid: str, household_id: str, state: dict) -> None:
    now = _now_iso()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO user_state (user_id, household_id, state_json, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(user_id) DO UPDATE SET
                 household_id = excluded.household_id,
                 state_json = excluded.state_json,
                 updated_at = excluded.updated_at""",
            (uid, household_id, json_dumps(state), now),
        )
        conn.execute(
            "UPDATE users SET household_id = ? WHERE id = ?",
            (household_id, uid),
        )
        conn.execute(
            "UPDATE households SET updated_at = ? WHERE id = ?",
            (now, household_id),
        )
        conn.commit()


def save_meal_image(uid: str, meal_id: str, data_url: str) -> None:
    size = len(data_url.encode("utf-8"))
    if size > MEAL_IMAGE_MAX_BYTES:
        raise ValueError("Photo is still too large. Try a smaller image or lower quality.")
    now = _now_iso()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO meal_images (user_id, meal_id, data_url, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(user_id, meal_id) DO UPDATE SET
                 data_url = excluded.data_url,
                 updated_at = excluded.updated_at""",
            (uid, str(meal_id), data_url, now),
        )
        conn.commit()


def load_meal_image(uid: str, meal_id: str) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT data_url FROM meal_images WHERE user_id = ? AND meal_id = ?",
            (uid, str(meal_id)),
        ).fetchone()
    return row["data_url"] if row else None


def delete_meal_image(uid: str, meal_id: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM meal_images WHERE user_id = ? AND meal_id = ?",
            (uid, str(meal_id)),
        )
        conn.commit()


def delete_all_meal_images(uid: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM meal_images WHERE user_id = ?", (uid,))
        conn.commit()


def partner_uid_from_household(household_id: str, my_uid: str) -> str | None:
    meta = load_household_meta(household_id)
    if not meta:
        return None
    slots = meta.get("slots", {})
    u1 = str(slots.get("u1") or "")
    me = str(my_uid or "")
    if not u1 or not me:
        return None
    if me == u1:
        for k in SLOT_ORDER:
            uid = slots.get(k)
            if uid:
                return str(uid)
        return None
    if me != u1:
        return u1
    return None


def list_partner_entries(meta: dict, owner_uid: str) -> list[dict]:
    owner = str(owner_uid or "")
    profiles = meta.get("profiles", {}) if isinstance(meta.get("profiles"), dict) else {}
    members = [str(m) for m in meta.get("members", [])]
    slots = meta.get("slots", {}) if isinstance(meta.get("slots"), dict) else {}
    out: list[dict] = []
    seen: set[str] = set()

    for uid in members:
        if not uid or uid == owner or uid in seen:
            continue
        seen.add(uid)
        name = str(profiles.get(uid, {}).get("name", "")).strip() or "Partner"
        out.append({"uid": uid, "name": name})

    if not out:
        for k in SLOT_ORDER:
            uid = slots.get(k)
            if not uid or str(uid) == owner or str(uid) in seen:
                continue
            seen.add(str(uid))
            name = str(profiles.get(uid, {}).get("name", "")).strip() or "Partner"
            out.append({"uid": str(uid), "name": name})
    return out


def list_household_connections(meta: dict, viewer_uid: str) -> list[dict]:
    me = str(viewer_uid or "")
    profiles = meta.get("profiles", {}) if isinstance(meta.get("profiles"), dict) else {}
    members = [str(m) for m in meta.get("members", [])]
    slots = meta.get("slots", {}) if isinstance(meta.get("slots"), dict) else {}
    out: list[dict] = []
    seen: set[str] = set()

    for uid in members:
        if not uid or uid == me or uid in seen:
            continue
        seen.add(uid)
        out.append({
            "uid": uid,
            "name": str(profiles.get(uid, {}).get("name", "")).strip() or "Partner",
        })

    if out:
        return out

    for k in ["u1", *SLOT_ORDER]:
        uid = slots.get(k)
        if not uid or str(uid) == me or str(uid) in seen:
            continue
        seen.add(str(uid))
        out.append({
            "uid": str(uid),
            "name": str(profiles.get(uid, {}).get("name", "")).strip() or "Partner",
        })
    return out


def _user_in_household(meta: dict, uid: str) -> bool:
    members = [str(m) for m in meta.get("members", [])]
    slots = meta.get("slots", {})
    me = str(uid)
    if me in members:
        return True
    return any(str(slots.get(k) or "") == me for k in ["u1", *SLOT_ORDER])


def assert_can_read_user_state(reader_uid: str, target_uid: str) -> None:
    if reader_uid == target_uid:
        return
    reader_hid = load_user_household_id_from_profile(reader_uid)
    target_hid = load_user_household_id_from_profile(target_uid)
    if not reader_hid or reader_hid != target_hid:
        raise PermissionError("Not allowed to read this user's data")
    meta = load_household_meta(reader_hid)
    if not meta or not _user_in_household(meta, reader_uid) or not _user_in_household(meta, target_uid):
        raise PermissionError("Not allowed to read this user's data")


def create_invite(household_id: str, from_uid: str, to_username: str) -> str:
    token = f"inv_{secrets.token_urlsafe(12)}"
    now = _now_iso()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO invites (token, household_id, from_uid, to_username, created_at, used_at, used_by)
               VALUES (?, ?, ?, ?, ?, NULL, NULL)""",
            (
                token,
                household_id,
                from_uid,
                to_username.strip().lower(),
                now,
            ),
        )
        conn.commit()
    return token


def accept_invite(token: str, uid: str, display_name: str, username: str) -> str:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM invites WHERE token = ?", (token,)).fetchone()
        if not row:
            raise ValueError("Invite not found.")
        inv = dict(row)
        expected = str(inv.get("to_username") or "").strip().lower()
        user_name = str(username or "").strip().lower()
        if expected and user_name and expected != user_name:
            raise ValueError("This invite was created for a different username.")

        household_id = str(inv.get("household_id") or "")
        if not household_id:
            raise ValueError("Invite missing household id.")

        used_by = str(inv.get("used_by") or "")
        if inv.get("used_at"):
            if used_by and used_by == str(uid):
                return household_id
            raise ValueError("Invite already used by another account. Ask for a fresh invite.")

        hh_row = conn.execute(
            "SELECT * FROM households WHERE id = ?", (household_id,)
        ).fetchone()
        data = _parse_household_row(dict(hh_row) if hh_row else None) or {}
        members = [str(m) for m in data.get("members", [])]
        next_members = list(dict.fromkeys([*members, uid]))
        slots = dict(data.get("slots", {}))
        if not slots.get("u1"):
            slots["u1"] = next_members[0] if next_members else uid
        if str(uid) != str(slots.get("u1") or ""):
            placed = False
            for k in SLOT_ORDER:
                if not slots.get(k):
                    slots[k] = uid
                    placed = True
                    break
            if not placed:
                raise ValueError("This household already has the maximum number of members.")

        profiles = dict(data.get("profiles", {}))
        profiles[uid] = {"name": str(display_name or "").strip()}
        now = _now_iso()

        if hh_row:
            conn.execute(
                """UPDATE households SET members_json = ?, slots_json = ?, profiles_json = ?, updated_at = ?
                   WHERE id = ?""",
                (
                    json_dumps(next_members),
                    json_dumps(slots),
                    json_dumps(profiles),
                    now,
                    household_id,
                ),
            )
        else:
            conn.execute(
                """INSERT INTO households (id, members_json, slots_json, profiles_json, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    household_id,
                    json_dumps(next_members),
                    json_dumps(slots),
                    json_dumps(profiles),
                    now,
                    now,
                ),
            )

        conn.execute(
            "UPDATE invites SET used_at = ?, used_by = ? WHERE token = ?",
            (now, uid, token),
        )
        conn.execute(
            "UPDATE users SET household_id = ?, display_name = COALESCE(NULLIF(display_name, ''), ?) WHERE id = ?",
            (household_id, str(display_name or "").strip(), uid),
        )
        conn.commit()
    return household_id


def remove_partner(household_id: str, actor_uid: str, target_partner_uid: str) -> None:
    target = str(target_partner_uid or "").strip()
    if not target:
        raise ValueError("Choose a partner to remove.")

    meta = load_household_meta(household_id)
    if not meta:
        raise ValueError("Household not found.")
    slots = dict(meta.get("slots", {}))
    if not slots.get("u1"):
        raise ValueError("Household missing owner slot.")
    owner = str(slots["u1"])
    if owner != str(actor_uid):
        raise ValueError("Only the household owner can remove a partner.")
    if target == owner:
        raise ValueError("You cannot remove the household owner.")

    partners = list_partner_entries(meta, owner)
    if not any(p["uid"] == target for p in partners):
        raise ValueError("That person is not a partner in this household.")

    members = [str(m) for m in meta.get("members", [])]
    next_members = [m for m in members if m and m != target]
    if not members:
        next_members = [owner, *[p["uid"] for p in partners if p["uid"] != target]]
    elif owner not in next_members:
        next_members.insert(0, owner)
    next_members = list(dict.fromkeys([m for m in next_members if m]))

    next_slots = dict(slots)
    for k in list(next_slots.keys()):
        if k != "u1" and str(next_slots[k]) == target:
            del next_slots[k]
    next_slots["u1"] = owner

    profiles = dict(meta.get("profiles", {}))
    profiles.pop(target, None)
    now = _now_iso()

    with get_connection() as conn:
        conn.execute(
            """UPDATE households SET members_json = ?, slots_json = ?, profiles_json = ?, updated_at = ?
               WHERE id = ?""",
            (
                json_dumps(next_members),
                json_dumps(next_slots),
                json_dumps(profiles),
                now,
                household_id,
            ),
        )
        conn.commit()


def delete_household(household_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM legacy_household_state WHERE household_id = ?", (household_id,))
        conn.execute("DELETE FROM households WHERE id = ?", (household_id,))
        conn.commit()


def delete_user_data(uid: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM meal_images WHERE user_id = ?", (uid,))
        conn.execute("DELETE FROM user_state WHERE user_id = ?", (uid,))
        conn.execute("DELETE FROM invites WHERE from_uid = ? OR used_by = ?", (uid, uid))
        conn.commit()
