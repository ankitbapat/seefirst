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
  if (res.status === 401 && user) { // saved login no longer exists: log out
    Object.keys(localStorage).filter((k) => k.startsWith('user-')).forEach((k) => localStorage.removeItem(k))
    alert(data.error)
    location.reload()
  } else if (!res.ok) alert(data.error || 'Error')
  return data
}

// Videos are a full web link (Supabase) or, in local mode, just a file name served from /videos
const videoSrc = (v) => (v.startsWith('http') ? v : '/videos/' + v)

const Badge = ({ status }) => <span className={'badge ' + status}>{status}</span>

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
  management: ['allenstation@cortland.com (Cortland at Allen Station)'],
}

function Login({ role, onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [register, setRegister] = useState(window.location.search.includes('register')) // customers and scouts can register
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [step, setStep] = useState('form') // sign-up: 'form', then 'code' (the emailed 6-digit code)
  const [code, setCode] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const post = async (url, body) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      return { ok: res.ok, data: await res.json() }
    }
    if (register && step === 'form') {
      const r = await post('/api/register/start', { firstName, lastName, phone, email, password, role })
      return r.ok ? setStep('code') : setError(r.data.error)
    }
    const r = register ? await post('/api/register/verify', { email, code }) : await post('/api/login', { email, password })
    if (!r.ok) return setError(r.data.error || 'Wrong email or password')
    r.data.role === role ? onLogin(r.data) : setError('This login is not for this page')
  }
  const titles = {
    customer: [register ? 'Create your account' : 'Welcome back', 'Sign up to request video tours of apartments.', 'Log in to see apartments and your tours.'],
    scout: [register ? 'Scout sign up' : 'Scout login', 'Create a scout account to accept tour requests.', 'Log in to see new tour requests.'],
    management: ['Apartment office login', '', 'Log in to manage tour requests for your property.'],
  }
  const [title, signupText, loginText] = titles[role]
  const verifying = register && step === 'code'
  return (
    <main className="auth">
      <a className="brand-link" href="/">SeeFirst</a>
      <form onSubmit={submit} className="card auth-card">
        <h2>{verifying ? 'Check your email' : title}</h2>
        <p className="muted">
          {verifying ? `We sent a 6-digit code to ${email}. It expires in 10 minutes.` : register ? signupText : loginText}
        </p>
        {verifying ? (
          <input required inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
        ) : (
          <>
            {register && (
              <div className="row">
                <input required placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                <input required placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            )}
            {register && <input required type="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />}
            <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input required placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </>
        )}
        <button>{verifying ? 'Verify and create account' : register ? 'Continue' : 'Log in'}</button>
        {error && <p className="error">{error}</p>}
        {verifying && (
          <p className="switch muted">
            <a href="#" onClick={(e) => { e.preventDefault(); setError(''); setStep('form') }}>Use a different email</a>
          </p>
        )}
        {role !== 'management' && !verifying && (
          <p className="switch muted">
            {register ? 'Already have an account? ' : 'New here? '}
            <a href="#" onClick={(e) => { e.preventDefault(); setError(''); setRegister(!register) }}>
              {register ? 'Log in' : 'Register'}
            </a>
          </p>
        )}
      </form>
      {demoLogins[role] && (
        <div className="card muted demo">
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
  const [selected, setSelected] = useState('') // which complex is open on the right
  const [query, setQuery] = useState('') // search box above the complex list
  useEffect(() => { api('/apartments', user).then(setApts) }, [])

  const request = async (unitId) => {
    await api('/tours', user, { unitId, from, to })
    reload()
  }
  const cancel = async (id) => {
    if (confirm('Cancel this tour?')) { await api(`/tours/${id}/cancel`, user, {}); reload() }
  }
  const pay = async (id) => {
    await api(`/tours/${id}/pay`, user, {}); reload()
  }

  // group the units under their property
  const byProperty = {}
  apts.forEach((a) => { (byProperty[a.property] = byProperty[a.property] || []).push(a) })
  const names = Object.keys(byProperty)
  const q = query.trim().toLowerCase()
  const shown = names.filter((n) => (n + ' ' + byProperty[n][0].address).toLowerCase().includes(q))
  const current = names.includes(selected) ? selected : names[0]
  const cur = byProperty[current] || []
  const bedCounts = [...new Set(cur.map((u) => u.beds))].sort()

  return (
    <main>
      <div className="page-head">
        <h1>Find your next apartment</h1>
        <p className="muted">Pick a unit and the dates you'd like your video. A local scout will film the tour for you.</p>
      </div>

      <div className="range">
        <b>When would you like your video?</b>
        <span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </span>
      </div>

      {names.length > 0 && (
        <div className="browse">
          <div className="complex-side">
            <input type="search" placeholder="Search by name or city" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="muted">{shown.length} of {names.length} complexes</div>
            <div className="complex-list">
              {shown.map((name) => {
                const units = byProperty[name]
                return (
                  <button key={name} className={'complex-item' + (name === current ? ' active' : '')} onClick={() => setSelected(name)}>
                    <b>{name}</b>
                    <span>{units[0].address} · from ${Math.min(...units.map((u) => u.rent))}/mo</span>
                  </button>
                )
              })}
              {shown.length === 0 && <div className="muted">No complexes match.</div>}
            </div>
          </div>

          <div className="complex-panel">
            <h2>{current}</h2>
            <div className="muted">{cur[0].address} · {cur.length} units available</div>
            <div className="chips light">
              {cur[0].amenities.split(', ').map((x) => <span key={x}>{x}</span>)}
            </div>

            {bedCounts.map((n) => {
              const units = cur.filter((u) => u.beds === n)
              return (
                <details className="beds" key={current + n} open>
                  <summary>
                    <span>{n} Bedroom</span>
                    <span className="muted">{units.length} available · from ${Math.min(...units.map((u) => u.rent))}/mo</span>
                  </summary>
                  <div className="unit-grid">
                    {units.map((a) => (
                      <div className="unit" key={a.id}>
                        <h3>{a.unit}</h3>
                        <div className="price">${a.rent}<span>/mo</span></div>
                        <div className="stats">{a.beds} bd · {a.baths} ba · {a.sqft} sqft</div>
                        <button onClick={() => request(a.id)}>Request video tour</button>
                      </div>
                    ))}
                  </div>
                </details>
              )
            })}
          </div>
        </div>
      )}

      <h2>My tours</h2>
      {tours.length === 0 && <div className="card empty">No tours yet. Pick an apartment above to request your first tour.</div>}
      {[...tours].reverse().map((t) => (
        <div className={'card tour tour-' + t.status} key={t.id}>
          <div className="tour-head">
            <div><b>{t.unit}</b><div className="muted">{t.property} · {t.address}</div></div>
            <div><Badge status={t.status} />{t.paid && <Badge status="Approved" />}</div>
          </div>
          <Progress steps={customerSteps} status={t.status} />
          <div className="details">
            <div><span>Dates wanted</span>{t.from} to {t.to}</div>
            {t.scoutName && <div><span>Scout</span>{t.scoutName}</div>}
            {t.visitDate && <div><span>Visit</span>{t.visitDate}, {t.visitFrom} – {t.visitTo}</div>}
          </div>
          {t.status === 'Scheduled' && !t.paid && (
            <div className="pay">
              <b>The apartment confirmed your tour. Click Approve so the scout can go ahead.</b>
              <p>
                <button onClick={() => pay(t.id)}>Approve</button>
              </p>
            </div>
          )}
          {t.video && <video controls src={videoSrc(t.video)} />}
          {!['Completed', 'Cancelled', 'Declined'].includes(t.status) && (
            <p><button className="outline" onClick={() => cancel(t.id)}>Cancel tour</button></p>
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
  const decline = async (id) => {
    if (confirm("Decline this request? You won't see it again.")) { await api(`/tours/${id}/scout-decline`, user, {}); reload() }
  }
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
          <button onClick={() => accept(t.id)}>Accept</button>{' '}
          <button className="outline" onClick={() => decline(t.id)}>Decline</button>
        </div>
      ))}

      <h2>My tours</h2>
      {mine.length === 0 && <p className="muted">Nothing yet.</p>}
      {mine.map((t) => (
        <div className="card" key={t.id}>
          <b>{t.property} – {t.unit}</b> <Badge status={t.status} />{t.paid && <Badge status="Approved" />}
          <div className="muted">{t.address}</div>
          <Progress steps={scoutSteps} status={t.status} offset={1} />
          {t.status === 'Accepted' && <div>Waiting for the apartment to pick a time. You offered {t.windowDate}, {t.windowFrom} – {t.windowTo}.</div>}
          {t.visitDate && <div>Visit the apartment on {t.visitDate}, {t.visitFrom} – {t.visitTo}</div>}
          {t.status === 'Scheduled' && <div className="muted">Bring your photo ID and show it to the office on arrival.</div>}
          {t.status === 'Scheduled' && !t.paid && <div>Waiting for the customer to approve. Visit once this tour is approved.</div>}
          {t.status === 'Scheduled' && t.paid && (
            <p>Upload video: <input type="file" accept="video/*" onChange={(e) => e.target.files[0] && upload(t.id, e.target.files[0])} /></p>
          )}
          {t.video && <video controls src={videoSrc(t.video)} />}
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
          {t.apartmentEmail && <div className="muted">Apartment email: {t.apartmentEmail}</div>}
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
          {t.status === 'Scheduled' && <div>{t.paid ? 'Customer approved. The visit is on.' : 'Waiting for the customer to approve.'}</div>}
          {t.video && <video controls src={videoSrc(t.video)} />}
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
        <div className="hero-text">
          <div className="eyebrow">Apartment tours for renters</div>
          <h1>Tour your next apartment from anywhere.</h1>
          <p>Moving to a new city? A local scout films the apartment for you. Watch it from home before you rent.</p>
          <a className="button big white" href="/user?register=1">Get started</a>
        </div>
        <div className="video-mock">
          <div className="screen"><div className="play">▶</div></div>
          <div className="caption"><b>Apartment tour</b><span>Filmed by a local scout</span></div>
        </div>
      </section>

      <main>
        <h2 className="section-title">How it works</h2>
        <div className="steps">
          <div className="card"><span className="num">1</span><br /><b>Pick a unit</b><p>Choose an apartment and your dates.</p></div>
          <div className="card"><span className="num">2</span><br /><b>A scout visits</b><p>Your scout films the tour on a time the office confirms.</p></div>
          <div className="card"><span className="num">3</span><br /><b>Watch at home</b><p>Your video shows up in your account.</p></div>
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
