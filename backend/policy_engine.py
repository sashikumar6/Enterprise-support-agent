"""Retrieval and deterministic authorization for a tenant's policies."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PolicyDecision:
    permitted: bool
    mode: str
    source: str
    reason: str


POLICIES: dict[str, dict[str, Any]] = {
    "outage_credit": {
        "title": "Service Credit Policy v2.1",
        "filename": "service-credit-policy.md",
        "body": "Customers affected by a verified service outage for four or more hours may receive one automatic $10 service credit. Credits above $25 require supervisor approval. Identity verification is required before an account credit is issued.",
    },
    "technician": {
        "title": "Technician Visit Policy v1.4",
        "filename": "technician-visit-policy.md",
        "body": "SupportIQ may offer available diagnostic technician windows. The customer must explicitly confirm the selected window before an appointment is created. A confirmation must be sent through the originating channel.",
    },
    "device": {
        "title": "Remote Device Support Playbook v3.0",
        "filename": "remote-device-support.md",
        "body": "SupportIQ may run non-destructive line diagnostics and submit a remote gateway refresh for verified account holders. It must explain that reconnection can take up to three minutes.",
    },
    "escalation": {
        "title": "Customer Escalation Standard v2.0",
        "filename": "customer-escalation-standard.md",
        "body": "Escalate legal threats, fraud or account-security concerns, emergency reports, discrimination complaints, regulatory complaints, and explicit requests for a human manager. Include full conversation context and the actions already attempted.",
    },
    "billing": {
        "title": "Billing Explanation & Payment Policy v1.8",
        "filename": "billing-policy.md",
        "body": "SupportIQ may explain current invoices and payment due dates to verified account holders. It must not collect card details in chat, email, or voice transcripts. Payment changes and credits follow their own authorization rules.",
    },
}


class PolicyEngine:
    def __init__(self, directory: str | Path = "data/policies") -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        for item in POLICIES.values():
            path = self.directory / item["filename"]
            if not path.exists():
                path.write_text(f"# {item['title']}\n\n{item['body']}\n", encoding="utf-8")

    def search(self, query: str) -> list[dict[str, str]]:
        words = set(query.lower().replace("?", " ").split())
        matches: list[tuple[int, dict[str, Any]]] = []
        for key, item in POLICIES.items():
            score = len(words.intersection(set((key + " " + item["body"]).lower().replace("$", " ").split())))
            if score:
                matches.append((score, item))
        matches.sort(key=lambda item: item[0], reverse=True)
        return [{"title": item["title"], "excerpt": item["body"], "version": "Current"} for _, item in matches[:3]]

    def authorize(self, action: str, context: dict[str, Any]) -> PolicyDecision:
        if action == "issue_credit":
            outage = context.get("outage") or {}
            started = datetime.fromisoformat(outage.get("started_at", datetime.now(timezone.utc).isoformat()))
            age_hours = (datetime.now(timezone.utc) - started).total_seconds() / 3600
            permitted = bool(context.get("verified")) and age_hours >= 4 and context.get("amount", 0) <= 25
            return PolicyDecision(permitted, "automatic" if permitted else "escalate", POLICIES["outage_credit"]["title"], "Verified outage exceeds four hours" if permitted else "Credit conditions were not met")
        if action == "book_technician":
            confirmed = bool(context.get("customer_confirmation"))
            return PolicyDecision(confirmed, "customer_confirmation" if not confirmed else "automatic", POLICIES["technician"]["title"], "Customer confirmation is required" if not confirmed else "Selected appointment was confirmed")
        if action == "refresh_device":
            return PolicyDecision(bool(context.get("verified")), "automatic", POLICIES["device"]["title"], "Verified account holder")
        return PolicyDecision(False, "escalate", POLICIES["escalation"]["title"], "No policy authorization available")
