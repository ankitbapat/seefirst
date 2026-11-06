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

// Payment: customers pay $20 on Venmo. Put YOUR Venmo username here (without the @).
const VENMO_HANDLE = 'your-venmo-username'
const venmoLink = (t) =>
  `https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=20&note=${encodeURIComponent('SeeFirst tour ' + t.unit)}`

// Simple progress line: steps up to the current one get a check mark
const order = ['Requested', 'Accepted', 'Scheduled', 'Completed']
const customerSteps = ['Sent to scouts', 'Scout accepted', 'Apartment confirmed', 'Video ready']
const scoutSteps = ['Sent to apartment', 'Apartment confirmed', 'Video uploaded'] // starts once the scout accepts

function Progress({ steps, status, offset = 0 }) {
  const current = order.indexOf(status) - offset
  if (current < 0) return null // Cancelled / Declined just show their badge
  return (
    <div className="progress">
      {steps.map((s, i) => <span key={s} className={i <= current ? 'done' : ''}>{i <= current ? '✓ ' : ''}{s}</span>)}
    </div>
  )
}

const demoLogins = {
  management: ['cortlandallenstation@seefirst.test (Cortland at Allen Station)', 'cortlandnorthplano@seefirst.test (Cortland at North Plano)'],
}

function Login({ role, onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [register, setRegister] = useState(window.location.search.includes('register')) // customers and scouts can register
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    const res = await fetch(register ? '/api/register' : '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, phone, email, password, role }),
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error || 'Wrong email or password')
    data.role === role ? onLogin(data) : setError('This login is not for this page')
  }
  return (
    <main>
      <h2>See the apartment before you move</h2>
      <p className="muted">Log in as: <b>{role}</b> · <a href="/">Back</a></p>
      <form onSubmit={submit} className="card">
        {register && <input required placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />}
        {register && <input required placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />}
        {register && <input required type="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input required placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button>{register ? 'Register' : 'Log in'}</button>
        <p className="error">{error}</p>
        {role !== 'management' && (
          <p className="muted">
            {register ? 'Already have an account? ' : 'New here? '}
            <a href="#" onClick={(e) => { e.preventDefault(); setError(''); setRegister(!register) }}>
              {register ? 'Log in' : 'Register'}
            </a>
          </p>
        )}
      </form>
      {demoLogins[role] && (
        <div className="card muted">
          Demo logins (password: <b>pass</b>)<br />
          {demoLogins[role].map((l) => <div key={l}>{l}</div>)}
        </div>
      )}
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
  const pay = async (id) => {
    if (confirm('Confirm you sent $20 on Venmo?')) { await api(`/tours/${id}/pay`, user, {}); reload() }
  }
  return (
    <main>
      <h2>Available apartments</h2>
      <p className="card">
        I'm happy to get my video any time between{' '}
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /> and{' '}
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </p>
      <div className="grid">
        {apts.map((a) => (
          <div className="card apt" key={a.id}>
            <div className="muted">{a.property}</div>
            <h3>{a.unit}</h3>
            <div className="price">${a.rent}<span>/mo</span></div>
            <div className="chips">
              <span>{a.beds} bd</span><span>{a.baths} ba</span><span>{a.sqft} sqft</span>
            </div>
            <div className="muted">{a.address}</div>
            <div className="chips light">
              {a.amenities.split(', ').map((x) => <span key={x}>{x}</span>)}
            </div>
            <button onClick={() => request(a.id)}>Request video tour · $20</button>
          </div>
        ))}
      </div>

      <h2>My tours</h2>
      {tours.length === 0 && <p className="muted">No tours yet.</p>}
      {tours.map((t) => (
        <div className="card" key={t.id}>
          <b>{t.property} – {t.unit}</b> <Badge status={t.status} />{t.paid && <Badge status="Paid" />}
          <Progress steps={customerSteps} status={t.status} />
          <div className="muted">Wanted between {t.from} and {t.to}</div>
          {t.scoutName && <div>Scout: {t.scoutName}</div>}
          {t.visitDate && <div>Visit: {t.visitDate}, {t.visitFrom} – {t.visitTo}</div>}
          {t.status === 'Scheduled' && !t.paid && (
            <div className="pay">
              <b>The apartment confirmed your tour. Pay $20 to book it.</b>
              <div className="muted">Send $20 to @{VENMO_HANDLE} on Venmo, then click "I've paid".</div>
              <p>
                <a className="button" href={venmoLink(t)} target="_blank" rel="noreferrer">Pay $20 on Venmo</a>{' '}
                <button onClick={() => pay(t.id)}>I've paid</button>
              </p>
            </div>
          )}
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
          <b>{t.property} – {t.unit}</b> <Badge status={t.status} />{t.paid && <Badge status="Paid" />}
          <div className="muted">{t.address}</div>
          <Progress steps={scoutSteps} status={t.status} offset={1} />
          {t.status === 'Accepted' && <div>Waiting for the apartment to pick a time. You offered {t.windowDate}, {t.windowFrom} – {t.windowTo}.</div>}
          {t.visitDate && <div>Visit the apartment on {t.visitDate}, {t.visitFrom} – {t.visitTo}</div>}
          {t.status === 'Scheduled' && <div className="muted">Bring your photo ID and show it to the office on arrival.</div>}
          {t.status === 'Scheduled' && !t.paid && <div>Waiting for the customer to pay. Visit once this tour shows Paid.</div>}
          {t.status === 'Scheduled' && t.paid && (
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
          <div>Customer: {t.customerName} ({t.customerPhone || t.customerEmail})</div>
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
          {t.status === 'Scheduled' && <div>{t.paid ? 'Customer has paid. The visit is on.' : 'Waiting for the customer to pay.'}</div>}
          {t.video && <video controls src={'/videos/' + t.video} />}
        </div>
      ))}
    </main>
  )
}

// Simple routes: each URL is its own role, with its own saved login,
// so you can be logged in on all three pages at the same time.
const path = window.location.pathname.replace(/\/$/, '')
// Customer app (port 3000) only has /user. Staff app (port 3001) has /scout and /apartments.
const roles = __APP__ === 'staff' ? { '/scout': 'scout', '/apartments': 'management' } : { '/user': 'customer' }
const role = roles[path]
const Page = { customer: Customer, scout: Scout, management: Management }[role]

// "/" (or any unknown URL, like the old /login) = landing page, the other three = the role pages
export default function App() {
  if (!role) return <Landing />
  return <RoleApp />
}

function Landing() {
  if (__APP__ === 'staff') return <StaffHome />
  return (
    <>
      <nav>
        <b>SeeFirst</b>
        <span><a href="/user">Log in</a><a className="button small" href="/user?register=1">Register</a></span>
      </nav>

      <section className="hero">
        <h1>See the apartment before you move</h1>
        <p>
          Moving to a new city? A local scout visits the apartment for you and records a video tour,
          so you can see it for real before you sign a lease.
        </p>
        <a className="button big" href="/user?register=1">Get started</a>{' '}
        <a className="button big ghost" href="/user">Log in</a>
        <p className="muted">$20 per video tour</p>
      </section>

      <main>
        <h2 className="section-title">How it works</h2>
        <div className="steps">
          <div className="card"><span className="num">1</span><br /><b>Pick an apartment</b><p>Browse the available units and choose when you'd like your video.</p></div>
          <div className="card"><span className="num">2</span><br /><b>A local scout goes for you</b><p>A scout accepts your request and the apartment office confirms a time.</p></div>
          <div className="card"><span className="num">3</span><br /><b>Watch your video</b><p>The scout records the tour and uploads it. You watch it from home.</p></div>
        </div>

        <h2 className="section-title">Why SeeFirst</h2>
        <div className="steps">
          <div className="card"><b>The real picture</b><p>See the rooms and amenities as they are, not just listing photos.</p></div>
          <div className="card"><b>Someone on your side</b><p>Your scout works for you, not for the leasing office.</p></div>
          <div className="card"><b>Simple pricing</b><p>$20 per video tour. You pay after the apartment confirms the time.</p></div>
        </div>
      </main>

      <footer className="footer">SeeFirst · See first, then decide</footer>
    </>
  )
}

// Landing page of the staff app (scouts and apartment offices)
function StaffHome() {
  return (
    <main className="center">
      <h1 className="brand">SeeFirst Staff</h1>
      <h2>Scouts and apartment offices</h2>
      <p>
        <a className="button" href="/scout">Scout login</a>{' '}
        <a className="button" href="/apartments">Apartment login</a>
      </p>
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
