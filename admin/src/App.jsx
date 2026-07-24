import React, { useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, clearToken } from './api.js';

const fmtDate = (d) => new Date(d).toLocaleString();

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (user.role !== 'admin') throw new Error('Not an admin account');
      setToken(token);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <h2>Admin Login</h2>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error-msg">{error}</div>}
        <button className="btn" type="submit">Sign in</button>
      </form>
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/admin/stats').then(setStats).catch(console.error); }, []);
  if (!stats) return <p className="muted">Loading…</p>;
  return (
    <>
      <h2>Dashboard</h2>
      <div className="cards">
        <div className="card"><div className="label">Users</div><div className="num">{stats.users}</div></div>
        <div className="card"><div className="label">AI Requests</div><div className="num">{stats.aiRequests}</div></div>
        <div className="card"><div className="label">Credits Used</div><div className="num">{stats.creditsUsed}</div></div>
        <div className="card"><div className="label">Revenue</div><div className="num">₹{stats.revenue}</div></div>
      </div>
    </>
  );
}

const DEFAULT_MODEL_OPTION = { value: '', label: 'Default (global setting)' };

function UserModal({ user, onClose, onSaved }) {
  const isNew = !user;
  const [form, setForm] = useState({
    email: user?.email || '', name: user?.name || '', password: '',
    role: user?.role || 'user', status: user?.status || 'active', credits: 0,
    openai_model: user?.openai_model || '', vertex_model: user?.vertex_model || '',
  });
  const [error, setError] = useState('');
  const [models, setModels] = useState({ openai: [DEFAULT_MODEL_OPTION], vertex: [DEFAULT_MODEL_OPTION] });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => { api('/admin/models').then(setModels).catch(console.error); }, []);

  const save = async () => {
    setError('');
    try {
      if (isNew) {
        await api('/admin/users', { method: 'POST', body: form });
      } else {
        const body = {
          name: form.name, role: form.role, status: form.status,
          openai_model: form.openai_model, vertex_model: form.vertex_model,
        };
        if (form.password) body.password = form.password;
        await api(`/admin/users/${user.id}`, { method: 'PATCH', body });
      }
      onSaved();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isNew ? 'Create user' : `Edit ${user.email}`}</h3>
        {isNew && <div><label>Email</label><input value={form.email} onChange={set('email')} /></div>}
        <div><label>Name</label><input value={form.name} onChange={set('name')} /></div>
        <div><label>{isNew ? 'Password' : 'New password (leave blank to keep)'}</label>
          <input type="password" value={form.password} onChange={set('password')} /></div>
        <div><label>Role</label>
          <select value={form.role} onChange={set('role')}>
            <option value="user">user</option><option value="admin">admin</option>
          </select></div>
        {!isNew && <div><label>Status</label>
          <select value={form.status} onChange={set('status')}>
            <option value="active">active</option><option value="blocked">blocked</option>
          </select></div>}
        {!isNew && <div><label>OpenAI model (main)</label>
          <select value={form.openai_model} onChange={set('openai_model')}>
            {models.openai.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select></div>}
        {!isNew && <div><label>Vertex model (fallback)</label>
          <select value={form.vertex_model} onChange={set('vertex_model')}>
            {models.vertex.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select></div>}
        {isNew && <div><label>Initial credits</label><input type="number" value={form.credits} onChange={set('credits')} /></div>}
        {error && <div className="error-msg">{error}</div>}
        <div className="row" style={{ marginBottom: 0, justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

function CreditsModal({ user, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    try {
      await api(`/admin/users/${user.id}/credits`, { method: 'POST', body: { amount: Number(amount), reason } });
      onSaved();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Adjust credits — {user.email}</h3>
        <p className="muted">Current balance: {user.credits_balance}. Use a negative amount to deduct.</p>
        <div><label>Amount</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label>Reason</label><input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {error && <div className="error-msg">{error}</div>}
        <div className="row" style={{ marginBottom: 0, justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save} disabled={!amount}>Apply</button>
        </div>
      </div>
    </div>
  );
}

function Users() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null); // {type:'edit'|'new'|'credits', user}

  const load = useCallback(() => {
    api(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((d) => setUsers(d.users)).catch(console.error);
  }, [q]);
  useEffect(load, [load]);

  const remove = async (u) => {
    if (!confirm(`Delete ${u.email}? This removes their ledger and history too.`)) return;
    try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <>
      <h2>Users</h2>
      <div className="row">
        <input placeholder="Search email or name…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <button className="btn" onClick={() => setModal({ type: 'new' })}>+ New user</button>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>OpenAI model</th><th>Vertex model</th><th>Credits</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.email}</td>
              <td>{u.name || <span className="muted">—</span>}</td>
              <td>{u.role === 'admin' ? <span className="pill admin">admin</span> : 'user'}</td>
              <td><span className={`pill ${u.status}`}>{u.status}</span></td>
              <td className="muted">{u.openai_model || 'default'}</td>
              <td className="muted">{u.vertex_model || 'default'}</td>
              <td>{u.credits_balance}</td>
              <td className="muted">{fmtDate(u.created_at)}</td>
              <td>
                <div className="row" style={{ marginBottom: 0 }}>
                  <button className="btn small secondary" onClick={() => setModal({ type: 'edit', user: u })}>Edit</button>
                  <button className="btn small secondary" onClick={() => setModal({ type: 'credits', user: u })}>Credits</button>
                  <button className="btn small danger" onClick={() => remove(u)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {modal?.type === 'new' && <UserModal onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal?.type === 'edit' && <UserModal user={modal.user} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal?.type === 'credits' && <CreditsModal user={modal.user} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </>
  );
}

function Packages() {
  const [packages, setPackages] = useState([]);
  const [form, setForm] = useState({ name: '', credits: '', price: '' });

  const load = () => api('/admin/packages').then((d) => setPackages(d.packages)).catch(console.error);
  useEffect(() => { load(); }, []);

  const add = async () => {
    try {
      await api('/admin/packages', { method: 'POST', body: { ...form, credits: Number(form.credits), price: Number(form.price) } });
      setForm({ name: '', credits: '', price: '' });
      load();
    } catch (err) { alert(err.message); }
  };

  const toggle = async (p) => {
    await api(`/admin/packages/${p.id}`, { method: 'PATCH', body: { isActive: !p.is_active } });
    load();
  };

  const remove = async (p) => {
    if (!confirm(`Delete package "${p.name}"?`)) return;
    try { await api(`/admin/packages/${p.id}`, { method: 'DELETE' }); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <>
      <h2>Credit Packages</h2>
      <div className="row">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Credits" type="number" style={{ width: 100 }} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
        <input placeholder="Price (INR)" type="number" style={{ width: 110 }} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <button className="btn" onClick={add} disabled={!form.name || !form.credits || !form.price}>Add package</button>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Credits</th><th>Price</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {packages.map((p) => (
            <tr key={p.id}>
              <td>{p.id}</td><td>{p.name}</td><td>{p.credits}</td><td>{p.currency} {p.price}</td>
              <td><span className={`pill ${p.is_active ? 'active' : 'blocked'}`}>{p.is_active ? 'active' : 'inactive'}</span></td>
              <td>
                <div className="row" style={{ marginBottom: 0 }}>
                  <button className="btn small secondary" onClick={() => toggle(p)}>{p.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button className="btn small danger" onClick={() => remove(p)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const SETTING_LABELS = {
  credit_cost_text: 'Credits per text request',
  credit_cost_vision: 'Credits per screenshot/vision request',
  signup_bonus_credits: 'Free credits on signup',
  ai_model: 'AI model',
  ai_max_tokens: 'Max response tokens',
};

function SettingsView() {
  const [settings, setSettings] = useState([]);
  const [edits, setEdits] = useState({});

  const load = () => api('/admin/settings').then((d) => setSettings(d.settings)).catch(console.error);
  useEffect(() => { load(); }, []);

  const save = async (key) => {
    await api(`/admin/settings/${key}`, { method: 'PUT', body: { value: edits[key] } });
    setEdits((e) => { const { [key]: _, ...rest } = e; return rest; });
    load();
  };

  return (
    <>
      <h2>Settings</h2>
      <table>
        <thead><tr><th>Setting</th><th>Value</th><th></th></tr></thead>
        <tbody>
          {settings.map((s) => (
            <tr key={s.key}>
              <td>{SETTING_LABELS[s.key] || s.key} <span className="muted">({s.key})</span></td>
              <td>
                <input
                  value={edits[s.key] ?? s.value}
                  onChange={(e) => setEdits((ed) => ({ ...ed, [s.key]: e.target.value }))}
                  style={{ width: 200 }}
                />
              </td>
              <td><button className="btn small" disabled={edits[s.key] === undefined} onClick={() => save(s.key)}>Save</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Activity() {
  const [tab, setTab] = useState('transactions');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api(`/admin/${tab}`).then((d) => setRows(d.transactions || d.requests || d.orders)).catch(console.error);
  }, [tab]);

  return (
    <>
      <h2>Activity</h2>
      <div className="row">
        {['transactions', 'requests', 'orders'].map((t) => (
          <button key={t} className={`btn small ${tab === t ? '' : 'secondary'}`} onClick={() => setTab(t)}>
            {t === 'transactions' ? 'Credit ledger' : t === 'requests' ? 'AI requests' : 'Orders'}
          </button>
        ))}
      </div>
      {tab === 'transactions' && (
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Type</th><th>Amount</th><th>Balance</th><th>Description</th><th>When</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td><td>{r.email}</td><td>{r.type}</td>
              <td className={r.amount >= 0 ? 'pos' : 'neg'}>{r.amount >= 0 ? `+${r.amount}` : r.amount}</td>
              <td>{r.balance_after}</td><td className="muted">{r.description}</td><td className="muted">{fmtDate(r.created_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {tab === 'requests' && (
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Type</th><th>Model</th><th>Credits</th><th>Status</th><th>Tokens</th><th>When</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td><td>{r.email}</td><td>{r.request_type}</td><td>{r.model || '—'}</td>
              <td>{r.credits_charged}</td>
              <td><span className={`pill ${r.status}`}>{r.status}</span>{r.error_message && <span className="muted" title={r.error_message}> ⓘ</span>}</td>
              <td className="muted">{r.prompt_tokens ?? '—'} / {r.completion_tokens ?? '—'}</td>
              <td className="muted">{fmtDate(r.created_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {tab === 'orders' && (
        <table>
          <thead><tr><th>ID</th><th>User</th><th>Credits</th><th>Amount</th><th>Status</th><th>Created</th><th>Paid</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td><td>{r.email}</td><td>{r.credits}</td><td>{r.currency} {r.amount}</td>
              <td><span className={`pill ${r.status}`}>{r.status}</span></td>
              <td className="muted">{fmtDate(r.created_at)}</td>
              <td className="muted">{r.paid_at ? fmtDate(r.paid_at) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}

const VIEWS = {
  dashboard: { label: 'Dashboard', component: Dashboard },
  users: { label: 'Users', component: Users },
  packages: { label: 'Packages', component: Packages },
  activity: { label: 'Activity', component: Activity },
  settings: { label: 'Settings', component: SettingsView },
};

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(!!getToken());
  const [view, setView] = useState('dashboard');

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(({ user }) => setAuthed(user.role === 'admin'))
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return null;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const View = VIEWS[view].component;
  return (
    <div className="layout">
      <nav className="sidebar">
        <h1>Interview Helper</h1>
        {Object.entries(VIEWS).map(([key, v]) => (
          <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{v.label}</button>
        ))}
        <div className="spacer" />
        <button onClick={() => { clearToken(); setAuthed(false); }}>Log out</button>
      </nav>
      <main className="main"><View /></main>
    </div>
  );
}
