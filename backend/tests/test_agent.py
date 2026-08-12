import tempfile
import unittest
from pathlib import Path

from backend.agent import SupportAgent
from backend.database import EnterpriseStore
from backend.policy_engine import PolicyEngine


class AgentTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.store = EnterpriseStore(root / "supportiq.db")
        self.agent = SupportAgent(self.store, PolicyEngine(root / "policies"))

    def tearDown(self):
        self.tempdir.cleanup()

    def test_outage_issues_policy_limited_credit(self):
        conversation = self.store.create_conversation("chat")
        result = self.agent.respond(conversation["id"], "My internet is down again")
        self.assertEqual(result["intent"], "service_outage")
        self.assertIn("$10 service credit", result["response"])
        self.assertTrue(any(action["tool"] == "billing.issue_service_credit" for action in result["action_trace"]))

    def test_technician_requires_confirmation_then_books(self):
        conversation = self.store.create_conversation("chat")
        proposed = self.agent.respond(conversation["id"], "Schedule a technician")
        self.assertEqual(proposed["conversation"]["pending_action"]["type"], "book_technician")
        booked = self.agent.respond(conversation["id"], "Yes, book the first one")
        self.assertIn("booked", booked["response"])

    def test_explicit_human_request_escalates(self):
        conversation = self.store.create_conversation("email")
        result = self.agent.respond(conversation["id"], "I need a manager now")
        self.assertTrue(result["escalated"])
        self.assertEqual(result["conversation"]["status"], "escalated")


if __name__ == "__main__":
    unittest.main()
