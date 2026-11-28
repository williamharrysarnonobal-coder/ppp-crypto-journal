"""Weekly backup of William's Tanaydana data to Google Drive (2026-11-26).

Same tables as the app's Backup button (BACKUP_TABLES in js/dashboard.js),
only his own rows, saved as one JSON file in
G:\\My Drive\\Tanaydana Backups\\ (Google Drive for desktop uploads it).
Keeps the newest KEEP files. Then stamps user_profile.ui_prefs.last_backup so
the app's "You have never backed up" reminder knows.

Run by the scheduled task "Tanaydana Weekly Backup" (Sundays 9:00 AM) with
pyw.exe, no window. Log: C:\\Users\\Lenovo\\Documents\\BTC_BOT\\backup.log.
The service key comes from the gitignored bot_secrets.py and is never logged.
"""
import json, os, sys, glob, logging, urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bot_secrets import SUPABASE_URL, SUPABASE_SERVICE_KEY

OWNER_ID = "de907681-6970-4f87-bd46-9c30eb807b0b"
TABLES = ["trading_journal", "position_setups", "trading_accounts", "daily_plans", "mood_entries",
          "notebook_entries", "finance_accounts", "finance_transactions", "finance_budgets",
          "finance_recurring", "achievements", "user_profile", "app_visits", "playbooks", "arbab_messages",
          "budget_transactions"]
DEST = r"G:\My Drive\Tanaydana Backups"
KEEP = 12
LOG = r"C:\Users\Lenovo\Documents\BTC_BOT\backup.log"

os.makedirs(os.path.dirname(LOG), exist_ok=True)
logging.basicConfig(filename=LOG, level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
H = {"apikey": SUPABASE_SERVICE_KEY, "Authorization": "Bearer " + SUPABASE_SERVICE_KEY}


def fetch_all(table):
    rows, page, start = [], 1000, 0
    while True:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}?user_id=eq.{OWNER_ID}&select=*",
            headers={**H, "Range-Unit": "items", "Range": f"{start}-{start + page - 1}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            chunk = json.load(r)
        rows += chunk
        if len(chunk) < page:
            return rows
        start += page


def main():
    if not os.path.isdir(r"G:\My Drive"):
        logging.error("Google Drive (G:\\My Drive) is not available; backup skipped.")
        return 1
    out = {"app": "Tanaydana", "exported_at": datetime.now(timezone.utc).isoformat(), "source": "weekly_backup.py", "tables": {}}
    skipped = []
    for t in TABLES:
        try:
            rows = fetch_all(t)
            if t == "trading_accounts":   # the encrypted Upscale key never goes into a file
                rows = [{k: v for k, v in r.items() if k != "upscale_api_key_enc"} for r in rows]
            out["tables"][t] = rows
        except Exception as e:
            skipped.append(t)
            logging.warning("skipped %s: %s", t, str(e)[:160])
    os.makedirs(DEST, exist_ok=True)
    path = os.path.join(DEST, f"tanaydana-backup-{datetime.now().strftime('%Y-%m-%d')}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1, default=str)
    counts = ", ".join(f"{t} {len(r)}" for t, r in out["tables"].items())
    logging.info("saved %s (%s)%s", path, counts, f"; skipped {skipped}" if skipped else "")

    # Keep the newest KEEP backups made by this script.
    files = sorted(glob.glob(os.path.join(DEST, "tanaydana-backup-*.json")))
    for old in files[:-KEEP]:
        try:
            os.remove(old)
            logging.info("removed old backup %s", old)
        except Exception as e:
            logging.warning("could not remove %s: %s", old, e)

    # Tell the app: ui_prefs.last_backup (synced into localStorage on load).
    try:
        req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/user_profile?user_id=eq.{OWNER_ID}&select=ui_prefs", headers=H)
        with urllib.request.urlopen(req, timeout=30) as r:
            rows = json.load(r)
        prefs = (rows[0].get("ui_prefs") if rows else None) or {}
        prefs["last_backup"] = datetime.now(timezone.utc).isoformat()
        req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/user_profile?user_id=eq.{OWNER_ID}",
                                     data=json.dumps({"ui_prefs": prefs}).encode(), method="PATCH",
                                     headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"})
        urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        logging.warning("could not stamp last_backup: %s", str(e)[:160])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        logging.exception("backup failed: %s", e)
        sys.exit(1)
