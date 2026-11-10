import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { createServer as createVite } from 'vite'
import nodemailer from 'nodemailer'

// Settings (database, Gmail login etc.) come from the .env file in this folder
try { process.loadEnvFile('.env') } catch (e) { if (e.code !== 'ENOENT') console.log('Could not read .env:', e.message) }

// Two apps from one codebase:
//   node server.js customer   -> customers
//   node server.js staff 3001 -> scouts + apartment offices
// Locally the port is 3000 / 3001. On a host like Render the PORT it gives us is used.
const mode = process.argv[2] === 'staff' ? 'staff' : 'customer'

const app = express()
app.use(express.json())
app.use('/videos', express.static('uploads/videos')) // local mode only

// ---------- Storage ----------
// With DATABASE_URL set, all data lives in a Supabase (Postgres) database that both apps share,
// and videos go to Supabase Storage. Without it, data lives in data/*.json and videos in uploads/videos
// (local mode, both apps must then run on the same computer).
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null
const BUCKET = 'videos'

// Each list (users, apartments, tours) is stored as one JSON document
const read = async (f) => {
  if (!pool) return JSON.parse(fs.readFileSync(`data/${f}.json`, 'utf8'))
  return (await pool.query('select data from docs where name = $1', [f])).rows[0].data
}
const write = async (f, d) => {
  if (!pool) return fs.writeFileSync(`data/${f}.json`, JSON.stringify(d, null, 2))
  await pool.query(
    'insert into docs (name, data) values ($1, $2::jsonb) on conflict (name) do update set data = $2::jsonb',
    [f, JSON.stringify(d)]
  )
}

if (pool) {
  try {
    await pool.query('create table if not exists docs (name text primary key, data jsonb not null)')
    // first run only: copy the starting data from data/*.json into the database
    for (const f of ['users', 'apartments', 'tours']) {
      await pool.query('insert into docs (name, data) values ($1, $2::jsonb) on conflict (name) do nothing', [
        f,
        fs.readFileSync(`data/${f}.json`, 'utf8'),
      ])
    }
    console.log('Connected to the database')
  } catch (e) {
    console.error('Database setup failed:', e.message)
    process.exit(1)
  }
}

const upload = multer({ dest: 'uploads/videos', limits: { fileSize: 50 * 1024 * 1024 } }) // 50 MB videos

// Wraps a route so an error becomes a JSON error instead of crashing the server
const h = (fn) => (req, res, next) =>
  fn(req, res, next).catch((e) => {
    console.error(e)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })

// ---------- Email ----------
const TEST_EMAIL = process.env.TEST_EMAIL || 'ankitbapatjob@gmail.com'
const OFFICE_EMAILS = { p1: 'allenstation@cortland.com' } // by propertyId
const emailFor = (propertyId) =>
  process.env.SEND_TO_APARTMENTS === 'true' ? OFFICE_EMAILS[propertyId] || TEST_EMAIL : TEST_EMAIL

const mailer = process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({ service: 'gmail', connectionTimeout: 10000, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  : null

// Returns false only if sending really failed. Without SMTP settings the email is printed in the terminal instead.
// (Gmail SMTP works on your own computer; Render's free plan blocks it.)
async function sendEmail(to, subject, text) {
  if (!mailer) {
    console.log(`[Email not sent: SMTP_USER / SMTP_PASS not set]\nTo: ${to}\nSubject: ${subject}\n${text}`)
    return true
  }
  try {
    await mailer.sendMail({ from: process.env.SMTP_USER, to, subject, text })
    console.log('Email sent to', to)
    return true
  } catch (e) {
    console.log('Email failed:', e.message)
    return false
  }
}

// ---------- Routes ----------
// "Auth": the browser sends the logged-in user's id in a header
const user = async (req) => (await read('users')).find((u) => u.id === req.headers['x-user-id'])

// Everything except login / sign-up needs a logged-in user that exists
app.use('/api', h(async (req, res, next) => {
  if (req.path === '/login' || req.path === '/register') return next()
  req.me = await user(req)
  req.me ? next() : res.status(401).json({ error: 'Please log in again.' })
}))

app.post('/api/login', h(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase()
  const u = (await read('users')).find((u) => u.email.toLowerCase() === email && u.password === req.body.password)
  u ? res.json(u) : res.status(401).json({ error: 'Wrong email or password' })
}))

// Sign-up for customers and scouts (apartment offices can't register)
app.post('/api/register', h(async (req, res) => {
  const { firstName, lastName, phone, password } = req.body
  const email = (req.body.email || '').trim().toLowerCase()
  const role = req.body.role === 'scout' ? 'scout' : 'customer'
  if (!email || !firstName || !lastName || !password) return res.status(400).json({ error: 'Please fill in every field' })
  const users = await read('users')
  if (users.find((u) => u.email.toLowerCase() === email)) return res.status(400).json({ error: 'Email already registered' })
  const u = { id: role[0] + Date.now(), role, name: `${firstName} ${lastName}`, email, phone, password }
  users.push(u)
  await write('users', users)
  res.json(u)
}))

app.get('/api/apartments', h(async (req, res) => res.json(await read('apartments'))))

// Each role only sees what it should
app.get('/api/tours', h(async (req, res) => {
  const me = await user(req)
  const tours = await read('tours')
  if (me.role === 'customer') return res.json(tours.filter((t) => t.customerId === me.id))
  // scouts see open requests they haven't declined, plus their own tours
  if (me.role === 'scout') return res.json(tours.filter((t) => (t.status === 'Requested' && !(t.declinedBy || []).includes(me.id)) || t.scoutId === me.id))
  res.json(tours.filter((t) => t.propertyId === me.propertyId && t.scoutId)) // only tours a scout accepted
}))

// Apartment office declines a tour for its own property
app.post('/api/tours/:id/decline', h(async (req, res) => {
  const me = await user(req)
  const tours = await read('tours')
  const t = tours.find((t) => t.id === req.params.id && t.propertyId === me.propertyId)
  if (!t || t.status === 'Completed') return res.status(400).json({ error: "Can't decline this tour" })
  t.status = 'Declined'
  await write('tours', tours)
  res.json({ ok: true })
}))

// Customer cancels their own tour (not after it's completed)
app.post('/api/tours/:id/cancel', h(async (req, res) => {
  const me = await user(req)
  const tours = await read('tours')
  const t = tours.find((t) => t.id === req.params.id && t.customerId === me.id)
  if (!t || ['Completed', 'Declined'].includes(t.status)) return res.status(400).json({ error: "Can't cancel this tour" })
  t.status = 'Cancelled'
  await write('tours', tours)
  res.json({ ok: true })
}))

// Customer requests a tour
app.post('/api/tours', h(async (req, res) => {
  const me = await user(req)
  const apt = (await read('apartments')).find((a) => a.id === req.body.unitId)
  if (!apt) return res.status(400).json({ error: 'Unknown apartment' })
  const tours = await read('tours')
  tours.push({
    id: 't' + Date.now(), status: 'Requested',
    customerId: me.id, customerName: me.name, customerPhone: me.phone, customerEmail: me.email,
    unitId: apt.id, propertyId: apt.propertyId, property: apt.property, address: apt.address, unit: apt.unit,
    from: req.body.from, to: req.body.to,
  })
  await write('tours', tours)
  res.json({ ok: true })
}))

// Scout accepts and gives a window, e.g. 08:00 - 17:00
app.post('/api/tours/:id/accept', h(async (req, res) => {
  const me = await user(req)
  const tours = await read('tours')
  const t = tours.find((t) => t.id === req.params.id)
  if (!t || t.status !== 'Requested') return res.status(400).json({ error: 'Already taken' })
  Object.assign(t, {
    status: 'Accepted', scoutId: me.id, scoutName: me.name, scoutPhone: me.phone,
    windowDate: req.body.date, windowFrom: req.body.start, windowTo: req.body.end,
    apartmentEmail: emailFor(t.propertyId),
  })
  await write('tours', tours)
  sendEmail(
    emailFor(t.propertyId),
    `New video tour request: ${t.unit} at ${t.property}`,
    `A scout has accepted a video tour request for ${t.unit} at ${t.property}.\n\n` +
      `Customer: ${t.customerName} (${t.customerPhone || t.customerEmail})\n` +
      `Scout: ${t.scoutName} (${t.scoutPhone})\n` +
      `Scout is available: ${t.windowDate}, ${t.windowFrom} - ${t.windowTo}\n\n` +
      `Please log in to SeeFirst to confirm a time. The scout will show photo ID when they arrive.`
  )
  res.json({ ok: true })
}))

// Scout declines an open request: it stays open for other scouts, but this scout no longer sees it
app.post('/api/tours/:id/scout-decline', h(async (req, res) => {
  const me = await user(req)
  const tours = await read('tours')
  const t = tours.find((t) => t.id === req.params.id)
  if (!t || t.status !== 'Requested') return res.status(400).json({ error: "Can't decline this request" })
  t.declinedBy = [...(t.declinedBy || []), me.id]
  await write('tours', tours)
  res.json({ ok: true })
}))

// Management picks the exact time, e.g. 10:00 - 11:00
app.post('/api/tours/:id/schedule', h(async (req, res) => {
  const tours = await read('tours')
  const t = tours.find((t) => t.id === req.params.id)
  if (!t) return res.status(400).json({ error: 'Unknown tour' })
  Object.assign(t, { status: 'Scheduled', visitDate: req.body.date, visitFrom: req.body.start, visitTo: req.body.end })
  await write('tours', tours)
  res.json({ ok: true })
}))

// Customer approves the tour (the scout can upload the video only after this)
app.post('/api/tours/:id/pay', h(async (req, res) => {
  const me = await user(req)
  const tours = await read('tours')
  const t = tours.find((t) => t.id === req.params.id && t.customerId === me.id)
  if (!t || t.status !== 'Scheduled') return res.status(400).json({ error: "Can't approve this tour yet" })
  t.paid = true
  await write('tours', tours)
  res.json({ ok: true })
}))

// Scout uploads the video -> Completed (only after the customer has paid)
app.post('/api/tours/:id/video', upload.single('video'), h(async (req, res) => {
  const tours = await read('tours')
  const t = tours.find((t) => t.id === req.params.id)
  if (!t || !t.paid || !req.file) {
    if (req.file) fs.unlink(req.file.path, () => {}) // throw away the upload
    return res.status(400).json({ error: !req.file ? 'Please choose a video' : 'The customer has not approved yet' })
  }
  let video = req.file.filename // local mode: the file name, served from /videos
  if (supabase) {
    // shared mode: put the video in Supabase Storage and keep its public link
    const name = req.file.filename + path.extname(req.file.originalname)
    const { error } = await supabase.storage.from(BUCKET).upload(name, fs.readFileSync(req.file.path), { contentType: req.file.mimetype })
    fs.unlink(req.file.path, () => {})
    if (error) return res.status(500).json({ error: 'Video upload failed: ' + error.message })
    video = supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl
  }
  Object.assign(t, { status: 'Completed', video })
  await write('tours', tours)
  res.json({ ok: true })
}))

// Upload problems (like a file over 50 MB) come back as a readable message
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That video is too big (50 MB max).' : err.message })
})

// ---------- The React app ----------
// Served through Vite so one command runs everything
process.env.NODE_ENV = 'development' // Render sets production; Vite's dev server needs development or React complains
const vite = await createVite({
  mode: 'development',
  define: { __APP__: JSON.stringify(mode) }, // tells the React app which pages to show
  server: {
    middlewareMode: true,
    allowedHosts: true,
    // live reload: own port per app locally, switched off on Render (only one port is reachable there)
    hmr: process.env.RENDER ? false : { port: mode === 'staff' ? 24679 : 24678 },
  },
  appType: 'spa',
})
app.use(vite.middlewares)

const port = process.env.PORT || process.argv[3] || 3000 // Render sets PORT; locally 3000 (customer) or 3001 (staff)
app.listen(port, () => console.log(`SeeFirst ${mode} app running on port ${port}`))