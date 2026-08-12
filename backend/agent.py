"""Channel-neutral autonomous customer service runtime for the demo tenant."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from .database import EnterpriseStore
from .policy_engine import PolicyEngine


class SupportAgent:
    def __init__(self, store: EnterpriseStore, policies: PolicyEngine) -> None:
        self.store, self.policies = store, policies

    @staticmethod
    def _intent(message: str) -> str:
        text = message.lower()
        if any(term in text for term in ("manager", "human", "representative", "lawyer", "lawsuit", "fraud", "stolen identity", "discrimination", "regulator")):
            return "human_escalation"
        if (("internet" in text or "wifi" in text or "service" in text) and any(term in text for term in ("down", "out", "offline", "not working", "stopped"))) or "outage" in text:
            return "service_outage"
        if any(term in text for term in ("technician", "appointment", "visit", "come fix", "schedule")):
            return "technician_visit"
        if any(term in text for term in ("reboot", "restart", "refresh modem", "reset router")):
            return "device_refresh"
        if any(term in text for term in ("bill", "invoice", "charged", "payment", "credit")):
            return "billing"
        return "general_support"

    @staticmethod
    def _confirmed(message: str) -> bool:
        return bool(re.search(r"\b(yes|confirm|book|go ahead|please do|that works)\b", message.lower()))

    def _record(self, conversation_id: str, trace: list[dict[str, Any]], tool: str, input_data: dict[str, Any], output_data: dict[str, Any], source: str | None = None) -> None:
        self.store.log_action(conversation_id, tool, input_data, output_data, source)
        trace.append({"tool": tool, "result": output_data, "policy_source": source})

    def respond(self, conversation_id: str, message: str) -> dict[str, Any]:
        conversation = self.store.get_conversation(conversation_id)
        customer = self.store.get_customer(conversation["customer_id"])
        self.store.add_message(conversation_id, "customer", message)
        trace: list[dict[str, Any]] = []
        intent = self._intent(message)
        pending = conversation.get("pending_action")

        if pending and pending.get("type") == "book_technician" and self._confirmed(message):
            slot = next((candidate for candidate in pending["slots"] if candidate["id"] in message.lower() or candidate["label"].lower().split(",")[0] in message.lower()), pending["slots"][0])
            authorization = self.policies.authorize("book_technician", {"customer_confirmation": True})
            appointment = self.store.book_appointment(customer["id"], slot)
            self._record(conversation_id, trace, "scheduling.book_technician_visit", {"account": customer["account_number"], "slot": slot["id"]}, appointment, authorization.source)
            note = self.store.send_notification(customer["id"], conversation["channel"], f"Your technician visit {appointment['id']} is scheduled for {appointment['window']}.")
            self._record(conversation_id, trace, "notifications.send_confirmation", {"channel": conversation["channel"]}, note, authorization.source)
            self.store.set_pending_action(conversation_id, None)
            reply = f"Your technician visit is booked for {appointment['window']}. I sent the confirmation through this {conversation['channel']} conversation."
            confidence, escalation = 0.99, False
        elif intent == "human_escalation":
            reason = "Explicit human request or sensitive escalation trigger"
            ticket = self.store.create_ticket(conversation_id, reason)
            self._record(conversation_id, trace, "escalations.create_ticket", {"reason": reason}, ticket, "Customer Escalation Standard v2.0")
            reply = f"I’ve transferred this to a customer-care specialist as ticket {ticket['id']}. They’ll have this full conversation and the actions I’ve already taken, so you won’t need to repeat yourself."
            confidence, escalation = 0.99, True
        elif intent == "service_outage":
            outage = self.store.find_outage(customer["zip_code"])
            self._record(conversation_id, trace, "network.check_local_outage", {"zip_code": customer["zip_code"]}, outage or {"outage": None})
            if outage:
                started = datetime.fromisoformat(outage["started_at"])
                hours = round((datetime.now(timezone.utc) - started).total_seconds() / 3600, 1)
                auth = self.policies.authorize("issue_credit", {"outage": outage, "verified": bool(customer["verified"]), "amount": 10})
                credit_text = ""
                if auth.permitted:
                    credit, created = self.store.issue_credit(customer["id"], outage["id"], 10, "Verified outage over four hours")
                    self._record(conversation_id, trace, "billing.issue_service_credit", {"account": customer["account_number"], "amount": 10}, {**credit, "new": created}, auth.source)
                    credit_text = " I also applied the policy-approved $10 service credit to your account." if created else " A policy-approved $10 service credit is already on your account for this outage."
                notification = self.store.send_notification(customer["id"], conversation["channel"], f"Service outage {outage['id']} update: estimated restoration {outage['eta']}.")
                self._record(conversation_id, trace, "notifications.send_outage_update", {"channel": conversation["channel"]}, notification, "Service Credit Policy v2.1")
                eta = datetime.fromisoformat(outage["eta"]).astimezone().strftime("%-I:%M %p")
                reply = f"I found a verified neighborhood outage affecting your address, caused by {outage['cause'].lower()}. It began about {hours} hours ago and the current restoration estimate is {eta}.{credit_text} I’ve sent you an update through this channel."
                confidence, escalation = 0.98, False
            else:
                reply = "I don’t see a neighborhood outage at your address. I can run a remote connection refresh now, or help schedule a technician if that doesn’t restore service."
                confidence, escalation = 0.9, False
        elif intent == "device_refresh":
            auth = self.policies.authorize("refresh_device", {"verified": bool(customer["verified"])})
            if auth.permitted:
                result = self.store.refresh_device(customer["id"])
                self._record(conversation_id, trace, "device.refresh_connection", {"device": customer["device"]["id"]}, result, auth.source)
                reply = "I’ve sent a remote refresh to your ConnectLine Gateway X2. Your connection may drop briefly and should reconnect in about three minutes."
                confidence, escalation = 0.97, False
            else:
                reply, confidence, escalation = "I need to verify the account before I can refresh the equipment.", 0.7, False
        elif intent == "technician_visit":
            slots = self.store.available_slots()
            self._record(conversation_id, trace, "scheduling.find_available_slots", {"address": customer["address"]}, {"slots": slots}, "Technician Visit Policy v1.4")
            self.store.set_pending_action(conversation_id, {"type": "book_technician", "slots": slots})
            choices = "; ".join(slot["label"] for slot in slots)
            reply = f"I can arrange a diagnostic technician visit. Available windows are: {choices}. Tell me which window you want, and I’ll book it after your confirmation."
            confidence, escalation = 0.96, False
        elif intent == "billing":
            invoice = customer["latest_invoice"]
            self._record(conversation_id, trace, "billing.get_current_invoice", {"account": customer["account_number"]}, invoice, "Billing Explanation & Payment Policy v1.8")
            reply = f"Your current balance is ${invoice['total']:.2f}, due {invoice['due_date']}. It includes {invoice['detail']}. I can also help with a service issue or technician visit if you think the charge relates to a recent problem."
            confidence, escalation = 0.94, False
        else:
            sources = self.policies.search(message)
            reply = "I can help with service outages, router refreshes, billing explanations, and technician visits. Tell me what happened and I’ll check the right ConnectLine systems for you."
            confidence, escalation = 0.72, False

        self.store.add_message(conversation_id, "assistant", reply)
        final = self.store.get_conversation(conversation_id)
        return {
            "response": reply, "intent": intent, "confidence": confidence, "escalated": escalation,
            "action_trace": trace, "policy_sources": self.policies.search(message), "conversation": final,
        }
