#!/usr/bin/env python3
"""Optional Firestore publication. Explicit project and service account only; dry-run by default."""
from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import re

from crawler import KST, MANAGED_BY, read_snapshot, utc_now, valid_date

LEGACY_SOURCES = {"링커리어", "위비티", "올콘", "콘테스트코리아", "K-Startup"}


def is_crawler_owned(data):
    # A managedBy field alone is never enough to overwrite a member-owned record.
    return data.get("authorUid") == "crawler" and (
        data.get("managedBy") == MANAGED_BY or
        (not data.get("managedBy") and data.get("source") in LEGACY_SOURCES
         and data.get("authorName") == "NextWave Bot"))


def plan_writes(snapshot, existing, now=None):
    """Pure planner: only upsert owned IDs; archive legacy imports; never delete anything."""
    now = now or utc_now()
    today = datetime.fromisoformat(now.replace("Z", "+00:00")).astimezone(KST).date().isoformat()
    writes, skipped = [], []
    incoming_ids = {item["id"] for item in snapshot["items"]}
    for item in snapshot["items"]:
        previous = existing.get(item["id"])
        if previous is not None and not is_crawler_owned(previous):
            skipped.append(item["id"])
            continue
        data = {key: value for key, value in item.items() if key != "id"}
        data["updatedAt"] = now
        if previous and previous.get("createdAt"):
            data["createdAt"] = previous["createdAt"]
        writes.append({"id": item["id"], "data": data, "kind": "upsert"})
    for doc_id, previous in existing.items():
        if doc_id in incoming_ids or not is_crawler_owned(previous) or previous.get("status") == "archived":
            continue
        reason = None
        if previous.get("managedBy") != MANAGED_BY:
            # Earlier scrapers had no verified dates/stable IDs. Keep the audit trail, hide the import.
            reason = "legacy_unverified"
        elif valid_date(previous.get("deadline")) and previous["deadline"] < today:
            reason = "deadline_passed"
        if reason:
            writes.append({"id": doc_id, "kind": "archive", "data": {
                "status": "archived", "archivedReason": reason, "archivedAt": now, "updatedAt": now}})
    return writes, skipped


def publish(snapshot, project, credential_path, apply=False):
    import firebase_admin
    from firebase_admin import credentials, firestore
    from google.cloud.firestore_v1.base_query import FieldFilter

    # Reject accidentally cross-project credentials before connecting to any database.
    credential_data = json.loads(credential_path.read_text(encoding="utf-8"))
    if credential_data.get("project_id") != project or credential_data.get("type") != "service_account":
        raise ValueError("The explicit project must match the service account project_id")
    app = firebase_admin.initialize_app(credentials.Certificate(credential_data), {"projectId": project}, name="nextwave-crawler-publish")
    try:
        db = firestore.client(app)
        collection = db.collection("opportunities")
        # Query only the auto-import namespace; get all pages via the SDK iterator.
        existing = {doc.id: doc.to_dict() for doc in collection.where(filter=FieldFilter("authorUid", "==", "crawler")).stream()}
        references = [collection.document(x["id"]) for x in snapshot["items"]]
        for doc in db.get_all(references):
            if doc.exists:
                existing[doc.id] = doc.to_dict()
        writes, skipped = plan_writes(snapshot, existing)
        summary = {"project": project, "mode": "publish" if apply else "dry-run",
                   "upserts": sum(x["kind"] == "upsert" for x in writes),
                   "archives": sum(x["kind"] == "archive" for x in writes), "memberCollisionsSkipped": len(skipped)}
        print(json.dumps(summary, ensure_ascii=False))
        if not apply:
            return

        @firestore.transactional
        def write_owned(transaction, operation):
            reference = collection.document(operation["id"])
            current = reference.get(transaction=transaction)
            if current.exists and not is_crawler_owned(current.to_dict()):
                raise ValueError("Ownership changed during publication; refusing to overwrite")
            if operation["kind"] == "archive" and not current.exists:
                return
            data = dict(operation["data"])
            data["updatedAt"] = firestore.SERVER_TIMESTAMP
            if operation["kind"] == "upsert":
                # Normalise only database timestamps; snapshot remains plain portable JSON.
                data["createdAt"] = current.to_dict().get("createdAt") if current.exists else firestore.SERVER_TIMESTAMP
                data["archivedReason"] = data.get("archivedReason")
                data["archivedAt"] = data.get("archivedAt")
            transaction.set(reference, data, merge=True)

        for operation in writes:
            write_owned(db.transaction(), operation)
        db.collection("crawlerStatus").document("opportunities").set({
            "generatedAt": snapshot["generatedAt"], "lastSuccessAt": snapshot.get("lastSuccessAt"),
            "sources": snapshot["sources"], "publishedAt": firestore.SERVER_TIMESTAMP,
            "managedBy": MANAGED_BY,
        })
        print("Publication complete; no documents deleted.")
    finally:
        firebase_admin.delete_app(app)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=Path("data/opportunities.json"))
    parser.add_argument("--project", default=os.getenv("FIREBASE_PROJECT_ID"))
    parser.add_argument("--credentials", type=Path, default=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    parser.add_argument("--publish", action="store_true", help="Apply managed upserts/archives to the explicitly selected project")
    args = parser.parse_args(argv)
    if not args.snapshot.exists():
        parser.error("Snapshot does not exist; run crawler.py first")
    snapshot = read_snapshot(args.snapshot)
    if not args.project and not args.credentials and not args.publish:
        print(f"Local preview: {len(snapshot['items'])} validated records. No Firebase connection.\nUse --project and --credentials for a database comparison; add --publish to apply.")
        return 0
    if not args.project or not args.credentials:
        parser.error("Provide both --project and --credentials (or FIREBASE_PROJECT_ID / GOOGLE_APPLICATION_CREDENTIALS)")
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,61}[a-z0-9]", args.project):
        parser.error("Invalid Firebase project ID")
    if not args.credentials.is_file():
        parser.error("Service account file does not exist")
    publish(snapshot, args.project, args.credentials, args.publish)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
