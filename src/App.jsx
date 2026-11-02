import React, { useState, useEffect } from 'react'

const today = new Date().toISOString().slice(0, 10)
const nextWeek = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)

// Talk to the server, always sending who is logged in
async function api(path, user, body, isForm) {
  const res = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-user-id': user?.id || '', ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  })
  const data = await res.json()
  if (!res.ok) alert(data.error || 'Error')
  return data
}

const Badge = ({ status }) => <span className={'badge ' + status}>{status}</span>

const demoLogins = {
  customer: ['customer1@seefirst.test', 'customer2@seefirst.test'],
  scout: ['scout1@seefirst.test', 'scout2@seefirst.test'],
  management: ['(Maple Court) :- maple@seefirst.test', '(Riverside Lofts) :- riverside@seefirst.test'],
}

function Login({ role, onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    })
    if (!res.ok) return setError('Wrong email or password')
    const u = await res.json()
    u.role === role ? onLogin(u) : setError('This login is not for this page')
  }
  return (
    <main>
      <h2>See the apartment before you move</h2>
      <p className="muted">Log in as: <b>{role}</b> · <a href="/login">Change</a></p>
      <form onSubmit={submit} className="card">
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button>Log in</button>
        <p className="error">{error}</p>
      </form>
      <div className="card muted">
        Demo logins (password: <b>pass</b>)<br />
        {demoLogins[role].map((l) => <div key={l}>{l}</div>)}
      </div>
    </main>
  )
}

function Customer({ user, tours, reload }) {
  const [apts, setApts] = useState([])
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(nextWeek)
  useEffect(() => { api('/apartments', user).then(setApts) }, [])

  const request = async (unitId) => {
    await api('/tours', user, { unitId, from, to })
    reload()
  }
  const cancel = async (id) => {
    if (confirm('Cancel this tour?')) { await api(`/tours/${id}/cancel`, user, {}); reload() }
  }
  return (
    <main>
      <h2>Available apartments</h2>
      <p>
        I'm happy to get my video any time between{' '}
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /> and{' '}
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </p>
      <div className="grid">
        {apts.map((a) => (
          <div className="card" key={a.id}>
            <b>{a.property} – {a.unit}</b>
            <div className="muted">{a.address}</div>
            <p>${a.rent}/mo · {a.beds} bd / {a.baths} ba · {a.sqft} sqft<br />{a.amenities}</p>
            <button onClick={() => request(a.id)}>Request video tour ($20)</button>
          </div>
        ))}
      </div>

      <h2>My tours</h2>
      {tours.length === 0 && <p className="muted">No tours yet.</p>}
      {tours.map((t) => (
        <div className="card" key={t.id}>
          <b>{t.property} – {t.unit}</b> <Badge status={t.status} />
          <div className="muted">Wanted between {t.from} and {t.to}</div>
          {t.scoutName && <div>Scout: {t.scoutName}</div>}
          {t.visitDate && <div>Visit: {t.visitDate}, {t.visitFrom} – {t.visitTo}</div>}
          {t.video && <video controls src={'/videos/' + t.video} />}
          {!['Completed', 'Cancelled', 'Declined'].includes(t.status) && (
            <p><button onClick={() => cancel(t.id)}>Cancel tour</button></p>
          )}
        </div>
      ))}
    </main>
  )
}

function Scout({ user, tours, reload }) {
  const [date, setDate] = useState(today)
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('17:00')

  const accept = async (id) => { await api(`/tours/${id}/accept`, user, { date, start, end }); reload() }
  const upload = async (id, file) => {
    const form = new FormData()
    form.append('video', file)
    await api(`/tours/${id}/video`, user, form, true)
    reload()
  }
  const open = tours.filter((t) => t.status === 'Requested')
  const mine = tours.filter((t) => t.status !== 'Requested')

  return (
    <main>
      <h2>New requests</h2>
      {open.length === 0 && <p className="muted">No open requests.</p>}
      {open.map((t) => (
        <div className="card" key={t.id}>
          <b>{t.property} – {t.unit}</b> <Badge status={t.status} />
          <div className="muted">{t.address}</div>
          <div>Customer is happy with any day between {t.from} and {t.to}</div>
          <p>
            I'm available on <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /> from{' '}
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} /> to{' '}
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </p>
          <button onClick={() => accept(t.id)}>Accept</button>
        </div>
      ))}

      <h2>My tours</h2>
      {mine.length === 0 && <p className="muted">Nothing yet.</p>}
      {mine.map((t) => (
        <div className="card" key={t.id}>
          <b>{t.property} – {t.unit}</b> <Badge status={t.status} />
          <div className="muted">{t.address}</div>
          {t.status === 'Accepted' && <div>Waiting for the apartment to pick a time. You offered {t.windowDate}, {t.windowFrom} – {t.windowTo}.</div>}
          {t.visitDate && <div>Visit the apartment on {t.visitDate}, {t.visitFrom} – {t.visitTo}</div>}
          {t.status === 'Scheduled' && <div className="muted">Bring your photo ID and show it to the office on arrival.</div>}
          {t.status === 'Scheduled' && (
            <p>Upload video: <input type="file" accept="video/*" onChange={(e) => e.target.files[0] && upload(t.id, e.target.files[0])} /></p>
          )}
          {t.video && <video controls src={'/videos/' + t.video} />}
        </div>
      ))}
    </main>
  )
}

function Management({ user, tours, reload }) {
  const [times, setTimes] = useState({}) // per-tour form values
  const set = (id, key, val) => setTimes({ ...times, [id]: { ...times[id], [key]: val } })
  const schedule = async (t) => {
    const f = times[t.id] || {}
    await api(`/tours/${t.id}/schedule`, user, {
      date: f.date || t.windowDate, start: f.start || '10:00', end: f.end || '11:00',
    })
    reload()
  }
  const decline = async (id) => {
    if (confirm('Decline this tour?')) { await api(`/tours/${id}/decline`, user, {}); reload() }
  }
  return (
    <main>
      <h2>Tour requests</h2>
      {tours.length === 0 && <p className="muted">No requests yet.</p>}
      {tours.map((t) => (
        <div className="card" key={t.id}>
          <b>{t.unit}</b> <Badge status={t.status} />
          <div>Customer: {t.customerName} ({t.customerPhone})</div>
          <div>Scout: {t.scoutName} ({t.scoutPhone})</div>
          {(t.status === 'Accepted' || t.status === 'Scheduled') && (
            <div className="muted">The scout will show photo ID when they arrive.</div>
          )}
          <div className="muted">{t.address}</div>
          {t.status === 'Accepted' && (
            <>
              <div>Scout is available {t.windowDate}, {t.windowFrom} – {t.windowTo}</div>
              <p>
                We can host the scout on <input type="date" defaultValue={t.windowDate} onChange={(e) => set(t.id, 'date', e.target.value)} /> from{' '}
                <input type="time" defaultValue="10:00" onChange={(e) => set(t.id, 'start', e.target.value)} /> to{' '}
                <input type="time" defaultValue="11:00" onChange={(e) => set(t.id, 'end', e.target.value)} />
              </p>
              <button onClick={() => schedule(t)}>Confirm</button>{' '}
              <button className="link" onClick={() => decline(t.id)}>Decline</button>
            </>
          )}
          {t.visitDate && <div>Scheduled: {t.visitDate}, {t.visitFrom} – {t.visitTo}</div>}
          {t.video && <video controls src={'/videos/' + t.video} />}
        </div>
      ))}
    </main>
  )
}

// Simple routes: each URL is its own role, with its own saved login,
// so you can be logged in on all three pages at the same time.
const path = window.location.pathname.replace(/\/$/, '')
const role = { '/user': 'customer', '/scout': 'scout', '/apartments': 'management' }[path]
const Page = { customer: Customer, scout: Scout, management: Management }[role]

// "/" = landing page, "/login" = pick a login, the other three = the role pages
export default function App() {
  if (path === '/login') return <ChooseLogin />
  if (!role) return <Landing />
  return <RoleApp />
}

function Landing() {
  return (
    <main className="center">
      <h1 className="brand">SeeFirst</h1>
      <h2>See the apartment before you move</h2>
      <p>
        Moving to a new city and can't visit apartments first? A local scout visits the apartment for you
        and records a video tour. You watch it from home.
      </p>
      <div className="steps">
        <div className="card"><b>1. Pick an apartment</b><br />Choose a unit and tell us when you'd like your video.</div>
        <div className="card"><b>2. A scout goes for you</b><br />A local scout accepts and the apartment office confirms a time.</div>
        <div className="card"><b>3. Watch your video</b><br />The scout records the tour and uploads it. $20 per tour.</div>
      </div>
      <a className="button" href="/login">Log in</a>
    </main>
  )
}

function ChooseLogin() {
  return (
    <main className="center">
      <h1 className="brand">SeeFirst</h1>
      <h2>Log in as</h2>
      <p>
        <a className="button" href="/user">User login</a>{' '}
        <a className="button" href="/scout">Scout login</a>{' '}
        <a className="button" href="/apartments">Apartment login</a>
      </p>
      <p><a href="/">← Back to home</a></p>
    </main>
  )
}

function RoleApp() {
  const key = 'user-' + role
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem(key) || 'null'))
  const [tours, setTours] = useState([])

  const reload = () => user && api('/tours', user).then(setTours)
  useEffect(() => { reload() }, [user])

  const login = (u) => { localStorage.setItem(key, JSON.stringify(u)); setUser(u) }
  const logout = () => { localStorage.removeItem(key); setUser(null); setTours([]) }

  if (!user) return <Login role={role} onLogin={login} />
  return (
    <>
      <nav>
        <b>SeeFirst</b>
        <span>{user.name} ({user.role}) <button className="link" onClick={reload}>Refresh</button> <button className="link" onClick={logout}>Log out</button></span>
      </nav>
      <Page user={user} tours={tours} reload={reload} />
    </>
  )
}
