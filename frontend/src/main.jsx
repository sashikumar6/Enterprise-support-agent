import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8123/api';

const initialState = { messages: [], pending_action: null, actions: [] };

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Service unavailable');
  return response.json();
}

function Icon({ children }) { return <span className="icon" aria-hidden="true">{children}</span>; }

function ChannelBadge({ channel }) {
  const labels = { chat: 'Chat', email: 'Email', voice: 'Voice call' };
  return <span className={`badge ${channel}`}>{channel === 'chat' ? '◌' : channel === 'email' ? '✉' : '◉'} {labels[channel]}</span>;
}

function Trace({ result }) {
  if (!result?.action_trace?.length) return null;
  return <div className="trace">
    <div className="eyebrow">Autonomous actions completed</div>
    {result.action_trace.map((item, index) => <div className="trace-row" key={`${item.tool}-${index}`}><span className="trace-check">✓</span><span>{item.tool.replaceAll('.', ' · ').replaceAll('_', ' ')}</span><small>{item.policy_source || 'System connector'}</small></div>)}
  </div>;
}

function Chat({ channel = 'chat', title = 'Customer support' }) {
  const [conversation, setConversation] = useState(initialState);
  const [conversationId, setConversationId] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  const start = async () => {
    setBusy(true); setError('');
    try {
      const data = await api('/conversations', { method: 'POST', body: JSON.stringify({ channel }) });
      setConversationId(data.id); setConversation(data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  useEffect(() => { start(); }, [channel]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation.messages]);

  const send = async (override) => {
    const text = (override || message).trim();
    if (!text || !conversationId || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api(`/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
      setConversation(result.conversation); setLastResult(result);
      if (channel === 'voice' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.response));
      }
    } catch (err) { setError(err.message); setMessage(text); } finally { setBusy(false); }
  };

  const quickPrompts = conversation.pending_action ? ['Yes, book the first one', 'Show other times'] : [
    'My internet has been down all morning', 'Schedule a technician', 'Why is my bill $84.50?', 'Refresh my router', 'I need a manager',
  ];

  return <section className="conversation-card">
    <div className="conversation-top"><div><span className="eyebrow">ConnectLine powered by SupportIQ</span><h2>{title}</h2></div><ChannelBadge channel={channel} /></div>
    <div className="customer-strip"><div className="avatar">RS</div><div><strong>Riya Sharma</strong><span>Fiber 1 Gig · Account CL-48291</span></div><span className="verified">● Verified</span></div>
    <div className="messages">
      {conversation.messages.map((item, index) => <div key={`${item.created_at}-${index}`} className={`message ${item.role}`}><span>{item.role === 'assistant' ? 'SupportIQ' : 'Riya'}</span><p>{item.body}</p></div>)}
      {busy && <div className="thinking"><i></i><i></i><i></i> SupportIQ is checking approved company systems…</div>}
      <div ref={endRef} />
    </div>
    {error && <div className="error">{error}</div>}
    <div className="quick-prompts">{quickPrompts.map(prompt => <button key={prompt} disabled={busy} onClick={() => send(prompt)}>{prompt}</button>)}</div>
    <div className="composer"><input value={message} disabled={busy} onKeyDown={event => event.key === 'Enter' && send()} onChange={event => setMessage(event.target.value)} placeholder="Describe what you need help with…" /><button className="primary" onClick={() => send()} disabled={busy || !message.trim()}>Send <Icon>→</Icon></button></div>
    <Trace result={lastResult} />
  </section>;
}

function Email() {
  const [form, setForm] = useState({ from_email: 'riya.sharma@example.com', subject: 'Internet is down', body: 'My internet has been down since this morning. Can you help?' });
  const [response, setResponse] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async event => { event.preventDefault(); setBusy(true); setError(''); try { setResponse(await api('/inbound/email', { method: 'POST', body: JSON.stringify(form) })); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <section className="email-layout"><section className="email-card"><span className="eyebrow">✉ Email intake</span><h1>Send an email to ConnectLine</h1><p>SupportIQ resolves the request and returns a response through the original channel.</p><form onSubmit={submit}><label>Email address<input value={form.from_email} onChange={e => setForm({...form, from_email:e.target.value})} /></label><label>Subject<input value={form.subject} onChange={e => setForm({...form, subject:e.target.value})} /></label><label>Message<textarea rows="6" value={form.body} onChange={e => setForm({...form, body:e.target.value})} /></label><button className="primary wide" disabled={busy}>{busy ? 'Resolving request…' : 'Send email'}</button></form>{error && <div className="error">{error}</div>}</section>{response && <section className="reply-card"><div className="reply-heading"><span className="eyebrow">ConnectLine reply</span><ChannelBadge channel="email" /></div><p>{response.response}</p><Trace result={response} /></section>}</section>;
}

function Voice() {
  const [supported] = useState(() => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const [listening, setListening] = useState(false); const [transcript, setTranscript] = useState(''); const [result, setResult] = useState(null); const [busy, setBusy] = useState(false);
  const begin = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition(); recognition.lang = 'en-US'; recognition.interimResults = true; setListening(true);
    recognition.onresult = event => setTranscript([...event.results].map(item => item[0].transcript).join(''));
    recognition.onerror = () => setListening(false); recognition.onend = () => setListening(false); recognition.start();
  };
  const send = async () => { if (!transcript.trim()) return; setBusy(true); try { const response = await api('/inbound/voice', { method: 'POST', body: JSON.stringify({ text: transcript }) }); setResult(response); if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(response.response)); } finally { setBusy(false); } };
  return <section className="voice-page"><span className="eyebrow">◉ Voice intake</span><h1>ConnectLine phone support</h1><p>Browser voice is transcribed, handled by the same agent, and read back using local speech synthesis.</p><div className={`voice-orb ${listening ? 'listening' : ''}`}><button onClick={begin} disabled={!supported || busy}><span>{listening ? 'Listening…' : 'Start speaking'}</span><b>◉</b></button></div>{!supported && <p className="subtle">Voice recognition is not available in this browser. Type a call transcript below to simulate an inbound phone call.</p>}<textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Try: My internet has been down all morning." rows="4" /><button className="primary" onClick={send} disabled={busy || !transcript.trim()}>{busy ? 'Handling call…' : 'Send call transcript'}</button>{result && <div className="voice-reply"><span className="eyebrow">Agent response</span><p>{result.response}</p><Trace result={result} /></div>}</section>;
}

function Operations() {
  const [data, setData] = useState(null); const [policies, setPolicies] = useState([]);
  const load = async () => { const [dashboard, policyList] = await Promise.all([api('/dashboard'), api('/policies')]); setData(dashboard); setPolicies(policyList.policies); };
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, []);
  if (!data) return <div className="loading">Loading operations intelligence…</div>;
  const metrics = data.metrics;
  return <section className="operations"><div className="section-heading"><div><span className="eyebrow">ConnectLine · Operations</span><h1>Autonomous service control room</h1><p>Every recommendation, tool call, policy source, and human escalation is observable.</p></div><button onClick={load}>Refresh</button></div><div className="metrics"><div><span>Conversations</span><strong>{metrics.conversations}</strong></div><div><span>Autonomous actions</span><strong>{metrics.autonomous_actions}</strong></div><div><span>Containment rate</span><strong>{metrics.containment_rate}%</strong></div><div><span>Open escalations</span><strong>{metrics.open_escalations}</strong></div></div><div className="ops-grid"><section className="table-card"><h2>Recent autonomous activity</h2>{data.actions.length ? <div className="table">{data.actions.map(action => <div className="activity" key={action.id}><span className="ok">✓</span><div><strong>{action.tool.replaceAll('.', ' · ').replaceAll('_', ' ')}</strong><small>{action.customer_name} · {action.channel}</small></div><small>{action.policy_source || 'System connector'}</small></div>)}</div> : <Empty text="Resolve a customer request to see policy-backed actions here." />}</section><section className="table-card"><h2>Human handoffs</h2>{data.tickets.length ? data.tickets.map(ticket => <div className="ticket" key={ticket.id}><span className="ticket-id">{ticket.id}</span><strong>{ticket.customer_name}</strong><p>{ticket.reason}</p><small>{ticket.queue} · {ticket.status}</small></div>) : <Empty text="No human handoffs. SupportIQ is containing routine requests." />}</section></div><section className="policy-card"><div><span className="eyebrow">Company policy knowledge</span><h2>Policies currently governing agent decisions</h2></div><div className="policy-list">{policies.map(policy => <article key={policy.title}><strong>{policy.title}</strong><p>{policy.excerpt}</p></article>)}</div></section></section>;
}

function Empty({ text }) { return <div className="empty">{text}</div>; }

function App() {
  const [view, setView] = useState('chat');
  const items = [['chat', 'Customer chat'], ['email', 'Email'], ['voice', 'Voice call'], ['ops', 'Agent operations']];
  const content = useMemo(() => view === 'chat' ? <Chat /> : view === 'email' ? <Email /> : view === 'voice' ? <Voice /> : <Operations />, [view]);
  return <div className="app"><header><button className="brand" onClick={() => setView('chat')}><span className="brand-mark">S</span><span>SupportIQ</span></button><div className="tenant"><span className="live-dot"></span> ConnectLine workspace</div><nav>{items.map(([id, label]) => <button className={view === id ? 'active' : ''} key={id} onClick={() => setView(id)}>{label}</button>)}</nav></header><main>{content}</main></div>;
}

createRoot(document.getElementById('root')).render(<App />);
