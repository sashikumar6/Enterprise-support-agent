from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .agent import SupportAgent
from .database import EnterpriseStore
from .policy_engine import PolicyEngine

store = EnterpriseStore()
policies = PolicyEngine()
agent = SupportAgent(store, policies)
app = FastAPI(title="SupportIQ Enterprise Service Agent", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


class ConversationInput(BaseModel):
    channel: Literal["chat", "email", "voice"] = "chat"
    customer_id: str = "cust-riya"


class MessageInput(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class EmailInput(BaseModel):
    from_email: str = "riya.sharma@example.com"
    subject: str = ""
    body: str = Field(min_length=1, max_length=4000)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "product": "SupportIQ", "tenant": "ConnectLine"}


@app.get("/api/demo-context")
def demo_context() -> dict:
    return {"tenant": {"name": "ConnectLine", "industry": "Telecommunications"}, "customer": store.get_customer(), "policies": policies.search("outage billing technician device escalation")}


@app.post("/api/conversations")
def create_conversation(payload: ConversationInput) -> dict:
    return store.create_conversation(payload.channel, payload.customer_id)


@app.get("/api/conversations/{conversation_id}")
def get_conversation(conversation_id: str) -> dict:
    try:
        return store.get_conversation(conversation_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/conversations/{conversation_id}/messages")
def send_message(conversation_id: str, payload: MessageInput) -> dict:
    try:
        return agent.respond(conversation_id, payload.text)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.post("/api/inbound/email")
def receive_email(payload: EmailInput) -> dict:
    conversation = store.create_conversation("email")
    return agent.respond(conversation["id"], f"Subject: {payload.subject}\n\n{payload.body}")


@app.post("/api/inbound/voice")
def receive_voice(payload: MessageInput) -> dict:
    conversation = store.create_conversation("voice")
    return agent.respond(conversation["id"], payload.text)


@app.get("/api/dashboard")
def dashboard() -> dict:
    return store.dashboard()


@app.get("/api/policies")
def list_policies() -> dict:
    return {"policies": policies.search("outage billing technician device escalation")}


@app.get("/")
def root() -> FileResponse:
    candidate = Path("frontend/dist/index.html")
    if candidate.exists():
        return FileResponse(candidate)
    raise HTTPException(404, "Frontend has not been built. Run npm run dev in frontend.")
