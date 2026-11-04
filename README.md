# SeeFirst

See the apartment before you move. A local scout visits the apartment for you and records a video tour, and you watch it from home.

This is a bare-minimum prototype, not a production app. It has fake demo data and no real payments.

## How it works

1. **Customer** picks a unit, sets a date range, and requests a video tour ($20 is shown as text only).
2. **Scout** sees the open request, accepts it, and gives a free time window (for example 8am to 5pm).
3. **Apartment office** sees the customer and scout contact info, and picks the exact time (for example 10 to 11am).
4. **Scout** visits, shows photo ID at the office, and uploads one video.
5. **Customer** watches the video.

Customers can cancel a tour until it is completed. The apartment office can decline a tour.

Tour statuses: `Requested` → `Accepted` → `Scheduled` → `Completed`, or `Cancelled` / `Declined`.

## Run it locally

You need Node.js 18 or newer.

```
npm install
npm run dev
```

Then open http://localhost:3000.

If something fails with an `esbuild` message, run `npm install-scripts approve esbuild` and try again.

## Pages

| URL | Who |
|---|---|
| `/` | Landing page with the three login buttons |
| `/user` | Customer login, registration and dashboard |
| `/scout` | Scout login, registration and dashboard |
| `/apartments` | Apartment office login and dashboard |

Each page keeps its own login in the browser, so you can be logged in on all three at the same time in different tabs.

## Accounts

- **Customers and scouts** register themselves on their login page (first name, last name, phone, email, password). Any password is accepted.
- **Apartment offices** cannot register. Two demo accounts are in `data/users.json` (password `pass`):
  - `maple@seefirst.test` — Cortland at Allen Station
  - `riverside@seefirst.test` — Cortland at North Plano

To test the whole flow, register a customer and a scout, request a tour, and then log in as the matching apartment office.

## Project structure

```
seefirst/
├── server.js            # Express API, JSON storage, video upload
├── index.html
├── vite.config.js
├── package.json
├── data/
│   ├── apartments.json  # 2 properties, 2 units each (placeholder details)
│   ├── users.json       # accounts (apartment offices + anyone who registers)
│   └── tours.json       # all tour requests
├── uploads/videos/      # uploaded videos
└── src/
    ├── index.jsx
    ├── App.jsx          # landing page and all three dashboards
    └── styles.css
```

State lives in the three JSON files, which the server reads and writes. Videos are saved in `uploads/videos/`. To reset the demo, set `data/tours.json` to `[]`.

## API

| Endpoint | What it does |
|---|---|
| `POST /api/login` | Log in with email and password |
| `POST /api/register` | Register a customer or scout |
| `GET /api/apartments` | List the 4 units |
| `GET /api/tours` | Tours the logged-in role should see |
| `POST /api/tours` | Customer requests a tour |
| `POST /api/tours/:id/accept` | Scout accepts and gives a time window |
| `POST /api/tours/:id/schedule` | Apartment office picks the exact time |
| `POST /api/tours/:id/video` | Scout uploads the video (marks it Completed) |
| `POST /api/tours/:id/cancel` | Customer cancels |
| `POST /api/tours/:id/decline` | Apartment office declines |

## Deploying (for demos)

The server runs the Vite dev server inside Express, so one process serves everything. On a host like Render:

- Build command: `npm install`
- Start command: `npm run dev`
- No environment variables needed. The host sets `PORT`, which the server uses.

Free hosts usually have temporary disks and put the app to sleep when idle, so registered users, tours and videos can disappear on restart or redeploy.

## Known limitations

This is a prototype, so it skips a lot on purpose:

- No real authentication. The browser sends a user ID the server trusts, and the server does not check roles on every action.
- Passwords are stored as plain text, and the login response includes the password.
- Uploaded videos have public links and no size or type limits.
- No real payments, scout ID verification, notifications or scheduling checks.
- The JSON files can be overwritten if two people act at the same moment.
- Property names are real, but rent, size and amenities are placeholder data.

Do not use real personal data in this app.
