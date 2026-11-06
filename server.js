import express from 'express'
import multer from 'multer'
import fs from 'fs'
import { createServer as createVite } from 'vite'

// Two apps from one codebase, run on two ports and sharing the same data/ and uploads/ folders:
//   node server.js customer  -> customers (port 3000)
//   node server.js staff 3001 -> scouts + apartment offices (port 3001)
const mode = process.argv[2] === 'staff' ? 'staff' : 'customer'

const app = express()
app.use(express.json())
app.use('/videos', express.static('uploads/videos'))

const read = (f) => JSON.parse(fs.readFileSync(`data/${f}.json`, 'utf8'))
const write = (f, d) => fs.writeFileSync(`data/${f}.json`, JSON.stringify(d, null, 2))
const upload = multer({ dest: 'uploads/videos' })

// "Auth": the browser sends the logged-in user's id in a header
const user = (req) => read('users').find((u) => u.id === req.headers['x-user-id'])

app.post('/api/login', (req, res) => {
  const u = read('users').find((u) => u.email === req.body.email && u.password === req.body.password)
  u ? res.json(u) : res.status(401).json({ error: 'Wrong email or password' })
})

// New customers and scouts sign up (apartment offices can't register)
app.post('/api/register', (req, res) => {
  const { firstName, lastName, phone, email, password } = req.body
  const role = req.body.role === 'scout' ? 'scout' : 'customer'
  const users = read('users')
  if (users.find((u) => u.email === email)) return res.status(400).json({ error: 'Email already registered' })
  const u = { id: role[0] + Date.now(), role, name: `${firstName} ${lastName}`, email, phone, password }
  users.push(u)
  write('users', users)
  res.json(u)
})

app.get('/api/apartments', (req, res) => res.json(read('apartments')))

// Each role only sees what it should
app.get('/api/tours', (req, res) => {
  const me = user(req)
  const tours = read('tours')
  if (me.role === 'customer') return res.json(tours.filter((t) => t.customerId === me.id))
  if (me.role === 'scout') return res.json(tours.filter((t) => t.status === 'Requested' || t.scoutId === me.id))
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
  })
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