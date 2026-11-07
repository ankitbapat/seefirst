import express from 'express'
import multer from 'multer'
import fs from 'fs'
import { randomInt } from 'crypto'
import { createServer as createVite } from 'vite'
import nodemailer from 'nodemailer'

// Settings (Gmail login etc.) come from the .env file in this folder
try { process.loadEnvFile('.env') } catch (e) { if (e.code !== 'ENOENT') console.log('Could not read .env:', e.message) }

// Two apps from one codebase, run on two ports and sharing the same data/ and uploads/ folders:
//   node server.js customer  -> customers (port 3000)
//   node server.js staff 3001 -> scouts + apartment offices (port 3001)
const mode = process.argv[2] === 'staff' ? 'staff' : 'customer'

const app = express()
app.use(express.json())
app.use('/videos', express.static('uploads/videos'))

const TEST_EMAIL = process.env.TEST_EMAIL || 'ankitbapatjob@gmail.com'
const OFFICE_EMAILS = { p1: 'allenstation@cortland.com' } // by propertyId
const emailFor = (propertyId) =>
  process.env.SEND_TO_APARTMENTS === 'true' ? OFFICE_EMAILS[propertyId] || TEST_EMAIL : TEST_EMAIL

const mailer = process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  : null

// Returns false only if sending really failed. Without SMTP settings the email is printed in the terminal instead.
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

const read = (f) => JSON.parse(fs.readFileSync(`data/${f}.json`, 'utf8'))
const write = (f, d) => fs.writeFileSync(`data/${f}.json`, JSON.stringify(d, null, 2))
const upload = multer({ dest: 'uploads/videos' })

// "Auth": the browser sends the logged-in user's id in a header
const user = (req) => read('users').find((u) => u.id === req.headers['x-user-id'])

app.post('/api/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase()
  const u = read('users').find((u) => u.email.toLowerCase() === email && u.password === req.body.password)
  u ? res.json(u) : res.status(401).json({ error: 'Wrong email or password' })
})

// Sign-up in two steps so only the owner of an email can register it (apartment offices can't register).
// Step 1: check the form, email a 6-digit code. Step 2: the person types the code and the account is created.
const pending = {} // email -> { form details, code, expires, tries } (kept in memory only)

app.post('/api/register/start', async (req, res) => {
  const { firstName, lastName, phone, password } = req.body
  const email = (req.body.email || '').trim().toLowerCase()
  const role = req.body.role === 'scout' ? 'scout' : 'customer'
  if (!email || !firstName || !lastName || !password) return res.status(400).json({ error: 'Please fill in every field' })
  if (read('users').find((u) => u.email.toLowerCase() === email)) return res.status(400).json({ error: 'Email already registered' })
  const code = String(randomInt(100000, 1000000))
  pending[email] = { role, name: `${firstName} ${lastName}`, phone, password, code, expires: Date.now() + 10 * 60 * 1000, tries: 0 }
  const sent = await sendEmail(email, 'Your SeeFirst verification code', `Your SeeFirst code is ${code}. It expires in 10 minutes.`)
  if (!sent) return res.status(500).json({ error: "We couldn't send the email. Check the address and try again." })
  res.json({ ok: true })
})

app.post('/api/register/verify', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase()
  const p = pending[email]
  if (!p || Date.now() > p.expires) return res.status(400).json({ error: 'That code expired. Please start again.' })
  if (++p.tries > 5) {
    delete pending[email]
    return res.status(400).json({ error: 'Too many wrong tries. Please start again.' })
  }
  if (String(req.body.code).trim() !== p.code) return res.status(400).json({ error: 'Wrong code' })
  const users = read('users')
  if (users.find((u) => u.email.toLowerCase() === email)) return res.status(400).json({ error: 'Email already registered' })
  const u = { id: p.role[0] + Date.now(), role: p.role, name: p.name, email, phone: p.phone, password: p.password }
  users.push(u)
  write('users', users)
  delete pending[email]
  res.json(u)
})

app.get('/api/apartments', (req, res) => res.json(read('apartments')))

// Each role only sees what it should
app.get('/api/tours', (req, res) => {
  const me = user(req)
  const tours = read('tours')
  if (me.role === 'customer') return res.json(tours.filter((t) => t.customerId === me.id))
  // scouts see open requests they haven't declined, plus their own tours
  if (me.role === 'scout') return res.json(tours.filter((t) => (t.status === 'Requested' && !(t.declinedBy || []).includes(me.id)) || t.scoutId === me.id))
  res.json(tours.filter((t) => t.propertyId === me.propertyId && t.scoutId)) // only tours a scout accepted
})

// Apartment office declines a tour for its own property
app.post('/api/tours/:id/decline', (req, res) => {
  const me = user(req)
  const tours = read('tours')
  const t = tours.find((t) => t.id === req.params.id && t.propertyId === me.propertyId)
  if (!t || t.status === 'Completed') return res.status(400).json({ error: "Can't decline this tour" })
  t.status = 'Declined'
  write('tours', tours)
  res.json({ ok: true })
})

// Customer cancels their own tour (not after it's completed)
app.post('/api/tours/:id/cancel', (req, res) => {
  const me = user(req)
  const tours = read('tours')
  const t = tours.find((t) => t.id === req.params.id && t.customerId === me.id)
  if (!t || ['Completed', 'Declined'].includes(t.status)) return res.status(400).json({ error: "Can't cancel this tour" })
  t.status = 'Cancelled'
  write('tours', tours)
  res.json({ ok: true })
})

// Customer requests a tour
app.post('/api/tours', (req, res) => {
  const me = user(req)
  const apt = read('apartments').find((a) => a.id === req.body.unitId)
  const tours = read('tours')
  tours.push({
    id: 't' + Date.now(), status: 'Requested',
    customerId: me.id, customerName: me.name, customerPhone: me.phone, customerEmail: me.email,
    unitId: apt.id, propertyId: apt.propertyId, property: apt.property, address: apt.address, unit: apt.unit,
    from: req.body.from, to: req.body.to,
  })
  write('tours', tours)
  res.json({ ok: true })
})

// Scout accepts and gives a window, e.g. 08:00 - 17:00
app.post('/api/tours/:id/accept', (req, res) => {
  const me = user(req)
  const tours = read('tours')
  const t = tours.find((t) => t.id === req.params.id)
  if (t.status !== 'Requested') return res.status(400).json({ error: 'Already taken' })
  Object.assign(t, {
    status: 'Accepted', scoutId: me.id, scoutName: me.name, scoutPhone: me.phone,
    windowDate: req.body.date, windowFrom: req.body.start, windowTo: req.body.end,
    apartmentEmail: emailFor(t.propertyId),
  })
  write('tours', tours)
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
})

// Scout declines an open request: it stays open for other scouts, but this scout no longer sees it
app.post('/api/tours/:id/scout-decline', (req, res) => {
  const me = user(req)
  const tours = read('tours')
  const t = tours.find((t) => t.id === req.params.id)
  if (!t || t.status !== 'Requested') return res.status(400).json({ error: "Can't decline this request" })
  t.declinedBy = [...(t.declinedBy || []), me.id]
  write('tours', tours)
  res.json({ ok: true })
})

// Management picks the exact time, e.g. 10:00 - 11:00
app.post('/api/tours/:id/schedule', (req, res) => {
  const tours = read('tours')
  const t = tours.find((t) => t.id === req.params.id)
  Object.assign(t, { status: 'Scheduled', visitDate: req.body.date, visitFrom: req.body.start, visitTo: req.body.end })
  write('tours', tours)
  res.json({ ok: true })
})

// Customer says they paid the $20 on Venmo (honor system: you check Venmo yourself)
app.post('/api/tours/:id/pay', (req, res) => {
  const me = user(req)
  const tours = read('tours')
  const t = tours.find((t) => t.id === req.params.id && t.customerId === me.id)
  if (!t || t.status !== 'Scheduled') return res.status(400).json({ error: "Can't pay for this tour yet" })
  t.paid = true
  write('tours', tours)
  res.json({ ok: true })
})

// Scout uploads the video -> Completed (only after the customer has paid)
app.post('/api/tours/:id/video', upload.single('video'), (req, res) => {
  const tours = read('tours')
  const t = tours.find((t) => t.id === req.params.id)
  if (!t || !t.paid) {
    if (req.file) fs.unlink(req.file.path, () => {}) // throw away the upload
    return res.status(400).json({ error: 'The customer has not paid yet' })
  }
  Object.assign(t, { status: 'Completed', video: req.file.filename })
  write('tours', tours)
  res.json({ ok: true })
})

// Serve the React app through Vite (so one command runs everything)
const vite = await createVite({
  define: { __APP__: JSON.stringify(mode) }, // tells the React app which pages to show
  // each app needs its own live-reload port, or the second one complains "Port 24678 is already in use"
  server: { middlewareMode: true, allowedHosts: true, hmr: { port: mode === 'staff' ? 24679 : 24678 } },
  appType: 'spa',
})
app.use(vite.middlewares)

const port = process.argv[3] || process.env.PORT || 3000 // Render sets PORT; locally 3000 (customer) or 3001 (staff)
app.listen(port, () => console.log(`SeeFirst ${mode} app running on port ${port}`))