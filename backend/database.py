"""Persistent local enterprise simulator used by the SupportIQ pilot.

The public methods in this file intentionally look like integration adapters.  In a
customer deployment, their implementations are replaced by CRM, billing, NOC,
device-management, and scheduling connectors without changing the agent.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EnterpriseStore:
    def __init__(self, path: str | Path = "data/supportiq.db") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def initialize(self) -> None:
        with self.connect() as db:
            db.executescript(
                """
                PRAGMA foreign_keys = ON;
                CREATE TABLE IF NOT EXISTS tenants (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, industry TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS customers (
                    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
                    email TEXT NOT NULL, phone TEXT NOT NULL, account_number TEXT NOT NULL,
                    plan TEXT NOT NULL, address TEXT NOT NULL, zip_code TEXT NOT NULL,
                    verified INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS outages (
                    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, zip_code TEXT NOT NULL,
                    status TEXT NOT NULL, started_at TEXT NOT NULL, eta TEXT NOT NULL,
                    cause TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, model TEXT NOT NULL,
                    status TEXT NOT NULL, signal TEXT NOT NULL, last_refresh_at TEXT
                );
                CREATE TABLE IF NOT EXISTS invoices (
                    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, total REAL NOT NULL,
                    due_date TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS credits (
                    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, outage_id TEXT,
                    amount REAL NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS appointments (
                    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, starts_at TEXT NOT NULL,
                    window TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
                    channel TEXT NOT NULL, status TEXT NOT NULL, pending_action TEXT,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL,
                    body TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS action_log (
                    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, tool TEXT NOT NULL,
                    input_json TEXT NOT NULL, output_json TEXT NOT NULL, policy_source TEXT,
                    status TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tickets (
                    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, queue TEXT NOT NULL,
                    reason TEXT NOT NULL, status TEXT NOT NULL, owner TEXT, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS notifications (
                    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, channel TEXT NOT NULL,
                    body TEXT NOT NULL, created_at TEXT NOT NULL
                );
                """
            )
            exists = db.execute("SELECT 1 FROM tenants WHERE id = 'connectline'").fetchone()
            if not exists:
                now = utcnow()
                db.execute("INSERT INTO tenants VALUES (?, ?, ?)", ("connectline", "ConnectLine", "Telecommunications"))
                db.execute(
                    "INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ("cust-riya", "connectline", "Riya Sharma", "riya.sharma@example.com", "+14155550182", "CL-48291", "Fiber 1 Gig", "220 Market Street, San Francisco", "94107", 1),
                )
                db.execute(
                    "INSERT INTO outages VALUES (?, ?, ?, ?, ?, ?, ?)",
                    ("OUT-901", "connectline", "94107", "investigating", (now - timedelta(hours=5, minutes=10)).isoformat(), (now + timedelta(hours=2, minutes=20)).isoformat(), "Fiber line damage near Market Street"),
                )
                db.execute("INSERT INTO devices VALUES (?, ?, ?, ?, ?, ?)", ("dev-48291", "cust-riya", "ConnectLine Gateway X2", "online", "degraded", None))
                db.execute(
                    "INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?)",
                    ("INV-8421", "cust-riya", 84.50, (now + timedelta(days=12)).date().isoformat(), "open", "Fiber 1 Gig $79.00 + equipment protection $5.50"),
                )

    @staticmethod
    def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
        return dict(row) if row else None

    def get_customer(self, customer_id: str = "cust-riya") -> dict[str, Any]:
        with self.connect() as db:
            customer = self._row(db.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone())
            if not customer:
                raise ValueError("Customer not found")
            customer["device"] = self._row(db.execute("SELECT * FROM devices WHERE customer_id = ?", (customer_id,)).fetchone())
            customer["latest_invoice"] = self._row(db.execute("SELECT * FROM invoices WHERE customer_id = ? ORDER BY due_date DESC LIMIT 1", (customer_id,)).fetchone())
            return customer

    def create_conversation(self, channel: str, customer_id: str = "cust-riya") -> dict[str, Any]:
        conversation_id, now = f"conv-{uuid.uuid4().hex[:10]}", utcnow().isoformat()
        with self.connect() as db:
            db.execute("INSERT INTO conversations VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (conversation_id, "connectline", customer_id, channel, "open", None, now, now))
            self._add_message(db, conversation_id, "assistant", "Hello, I’m ConnectLine’s SupportIQ assistant. I can check service, billing, equipment, and technician visits. How can I help?")
        return self.get_conversation(conversation_id)

    def _add_message(self, db: sqlite3.Connection, conversation_id: str, role: str, body: str) -> None:
        db.execute("INSERT INTO messages VALUES (?, ?, ?, ?, ?)", (f"msg-{uuid.uuid4().hex[:12]}", conversation_id, role, body, utcnow().isoformat()))

    def add_message(self, conversation_id: str, role: str, body: str) -> None:
        with self.connect() as db:
            self._add_message(db, conversation_id, role, body)
            db.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (utcnow().isoformat(), conversation_id))

    def get_conversation(self, conversation_id: str) -> dict[str, Any]:
        with self.connect() as db:
            conversation = self._row(db.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone())
            if not conversation:
                raise ValueError("Conversation not found")
            conversation["pending_action"] = json.loads(conversation["pending_action"]) if conversation["pending_action"] else None
            conversation["messages"] = [dict(row) for row in db.execute("SELECT role, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at", (conversation_id,))]
            conversation["actions"] = [dict(row) for row in db.execute("SELECT tool, input_json, output_json, policy_source, status, created_at FROM action_log WHERE conversation_id = ? ORDER BY created_at", (conversation_id,))]
            return conversation

    def set_pending_action(self, conversation_id: str, action: dict[str, Any] | None) -> None:
        with self.connect() as db:
            db.execute("UPDATE conversations SET pending_action = ?, updated_at = ? WHERE id = ?", (json.dumps(action) if action else None, utcnow().isoformat(), conversation_id))

    def log_action(self, conversation_id: str, tool: str, input_data: dict[str, Any], output_data: dict[str, Any], policy_source: str | None = None, status: str = "completed") -> None:
        with self.connect() as db:
            db.execute("INSERT INTO action_log VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (f"act-{uuid.uuid4().hex[:12]}", conversation_id, tool, json.dumps(input_data), json.dumps(output_data), policy_source, status, utcnow().isoformat()))

    # Connector-shaped business operations
    def find_outage(self, zip_code: str) -> dict[str, Any] | None:
        with self.connect() as db:
            return self._row(db.execute("SELECT * FROM outages WHERE zip_code = ? AND status != 'resolved' ORDER BY started_at DESC LIMIT 1", (zip_code,)).fetchone())

    def issue_credit(self, customer_id: str, outage_id: str, amount: float, reason: str) -> tuple[dict[str, Any], bool]:
        with self.connect() as db:
            existing = self._row(db.execute("SELECT * FROM credits WHERE customer_id = ? AND outage_id = ?", (customer_id, outage_id)).fetchone())
            if existing:
                return existing, False
            result = {"id": f"CR-{uuid.uuid4().hex[:6].upper()}", "amount": amount, "reason": reason}
            db.execute("INSERT INTO credits VALUES (?, ?, ?, ?, ?, ?)", (result["id"], customer_id, outage_id, amount, reason, utcnow().isoformat()))
            return result, True

    def refresh_device(self, customer_id: str) -> dict[str, Any]:
        with self.connect() as db:
            device = self._row(db.execute("SELECT * FROM devices WHERE customer_id = ?", (customer_id,)).fetchone())
            if not device:
                raise ValueError("No device found")
            db.execute("UPDATE devices SET last_refresh_at = ? WHERE id = ?", (utcnow().isoformat(), device["id"]))
            return {"device": device["model"], "result": "refresh command accepted", "estimated_reconnect_minutes": 3}

    def available_slots(self) -> list[dict[str, str]]:
        tomorrow = (utcnow() + timedelta(days=1)).date().isoformat()
        return [
            {"id": "slot-am", "label": f"{tomorrow}, 8:00–10:00 AM", "starts_at": f"{tomorrow}T08:00:00-07:00"},
            {"id": "slot-mid", "label": f"{tomorrow}, 12:00–2:00 PM", "starts_at": f"{tomorrow}T12:00:00-07:00"},
            {"id": "slot-pm", "label": f"{tomorrow}, 4:00–6:00 PM", "starts_at": f"{tomorrow}T16:00:00-07:00"},
        ]

    def book_appointment(self, customer_id: str, slot: dict[str, str], reason: str = "Service diagnostic") -> dict[str, Any]:
        result = {"id": f"APT-{uuid.uuid4().hex[:6].upper()}", "window": slot["label"], "reason": reason}
        with self.connect() as db:
            db.execute("INSERT INTO appointments VALUES (?, ?, ?, ?, ?, ?)", (result["id"], customer_id, slot["starts_at"], slot["label"], "scheduled", reason))
        return result

    def send_notification(self, customer_id: str, channel: str, body: str) -> dict[str, Any]:
        notification_id = f"note-{uuid.uuid4().hex[:8]}"
        with self.connect() as db:
            db.execute("INSERT INTO notifications VALUES (?, ?, ?, ?, ?)", (notification_id, customer_id, channel, body, utcnow().isoformat()))
        return {"id": notification_id, "channel": channel, "status": "queued"}

    def create_ticket(self, conversation_id: str, reason: str, queue: str = "Customer Care Escalations") -> dict[str, Any]:
        ticket_id = f"TKT-{uuid.uuid4().hex[:7].upper()}"
        with self.connect() as db:
            db.execute("INSERT INTO tickets VALUES (?, ?, ?, ?, ?, ?, ?)", (ticket_id, conversation_id, queue, reason, "open", None, utcnow().isoformat()))
            db.execute("UPDATE conversations SET status = 'escalated', updated_at = ? WHERE id = ?", (utcnow().isoformat(), conversation_id))
        return {"id": ticket_id, "queue": queue, "reason": reason, "status": "open"}

    def dashboard(self) -> dict[str, Any]:
        with self.connect() as db:
            total = db.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
            escalated = db.execute("SELECT COUNT(*) FROM conversations WHERE status = 'escalated'").fetchone()[0]
            actions = db.execute("SELECT COUNT(*) FROM action_log WHERE status = 'completed'").fetchone()[0]
            tickets = [dict(row) for row in db.execute("SELECT t.*, c.channel, cu.name AS customer_name FROM tickets t JOIN conversations c ON c.id=t.conversation_id JOIN customers cu ON cu.id=c.customer_id ORDER BY t.created_at DESC")]
            action_rows = [dict(row) for row in db.execute("SELECT a.*, c.channel, cu.name AS customer_name FROM action_log a JOIN conversations c ON c.id=a.conversation_id JOIN customers cu ON cu.id=c.customer_id ORDER BY a.created_at DESC LIMIT 20")]
        return {"metrics": {"conversations": total, "autonomous_actions": actions, "open_escalations": escalated, "containment_rate": round(((total-escalated)/total*100) if total else 100, 1)}, "tickets": tickets, "actions": action_rows}
