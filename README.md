# SupportIQ — Enterprise Customer-Service Agent Demo

SupportIQ is a policy-controlled, omnichannel service agent. This pilot is configured for **ConnectLine**, a telecommunications company. It is deliberately built around enterprise boundaries: the AI plans a resolution, a policy engine authorizes it, and connector-shaped tools execute persistent actions.

## What the demo proves

- One agent runtime for web chat, email intake, and browser voice.
- Policy-backed autonomous actions: verify an outage, issue a permitted service credit, send a notification, remotely refresh a device, and book a technician after customer confirmation.
- Human handoff only for sensitive cases or explicit requests, with the full context retained.
- Operations dashboard with the tool/action log, policy source, containment metric, and escalations.

The CRM, billing, network operations, device, scheduling, and notification systems are local persistent simulators with interfaces designed to be swapped for real enterprise APIs.

## Run locally

Terminal 1:

```bash
python3 -m uvicorn backend.main:app --reload --port 8123
```

Terminal 2:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Demo script

1. In **Customer chat**, select **“My internet has been down all morning.”**
   - The agent checks the network system, finds a verified five-hour outage, applies the policy-permitted $10 credit, and sends an update.
2. Select **“Schedule a technician.”**, then **“Yes, book the first one.”**
   - It searches availability, waits for customer confirmation, then books a persistent appointment.
3. Open **Email** and send the same outage request.
   - The same runtime receives it through email and responds with a logged action trace.
4. Open **Voice call**, speak or paste a transcript, then submit.
   - The browser transcribes when supported and reads the response aloud.
5. Open **Agent operations** to show completed tools, policies used, and escalated tickets.
6. In chat, send **“I need a manager.”** to show a full-context escalation.

## Product stages

1. **Core:** tenant model, policy engine, connector contracts, audit trail, normalized conversation events.
2. **Pilot workflows:** customer/account, outage, device, billing, scheduling, and notification integrations.
3. **Omnichannel customer experience:** chat, inbound email, and voice using one agent runtime.
4. **Enterprise operations:** human handoff dashboard, analytics, policy oversight, and a demo runbook.

## Production replacement path

Keep `SupportAgent` and the policy engine. Replace each `EnterpriseStore` method with an authenticated connector to the customer’s CRM, billing, network, device, scheduling, and notification systems. The agent must never receive unapproved tool access; policy authorization occurs before the connector action.
