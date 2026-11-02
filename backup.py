"""Daily backup utility: zips emails.db and all stored .eml files."""

from datetime import datetime, timezone
import os
from pathlib import Path
import sys
import zipfile

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "option2-raw-python" / "data"
DB_PATH = DATA_DIR / "emails.db"
INBOX_DIR = DATA_DIR / "inbox"
BACKUPS_DIR = BASE_DIR / "backups"


def create_backup():
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = BACKUPS_DIR / f"mail_backup_{timestamp}.zip"

    print(f"[backup] Creating backup archive at {backup_file}...")
    file_count = 0

    with zipfile.ZipFile(backup_file, "w", zipfile.ZIP_DEFLATED) as zipf:
        if DB_PATH.exists():
            zipf.write(DB_PATH, arcname="emails.db")
            print(f"  + Added emails.db ({DB_PATH.stat().st_size} bytes)")
            file_count += 1
        else:
            print("  ! No emails.db found (PostgreSQL or empty)")

        if INBOX_DIR.exists():
            for eml in INBOX_DIR.glob("*.eml"):
                zipf.write(eml, arcname=f"inbox/{eml.name}")
                file_count += 1
            print(f"  + Added {file_count - 1} .eml files from {INBOX_DIR}")

    size_mb = round(backup_file.stat().st_size / (1024 * 1024), 2)
    print(f"[backup] Completed! {file_count} files archived ({size_mb} MB) -> {backup_file}")
    return backup_file


if __name__ == "__main__":
    create_backup()
