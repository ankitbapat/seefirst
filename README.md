# SeeFirst

See the apartment before you move. A local scout visits the apartment for you and records a video tour, and you watch it from home.

This is a bare-minimum prototype, not a production app. It has fake demo data and no real payments.

## How it works

1. **Customer** picks a unit, sets a date range, and requests a video tour ($20 is shown as text only).
2. **Scout** sees the open request, accepts it, and gives a free time window (for example 8am to 5pm).
3. **Apartment office** sees the customer and scout contact info, and picks the exact time (for example 10 to 11am).
4. **Customer** pays $20 on Venmo and clicks "I've paid". The tour then shows a **Paid** badge for everyone.
5. **Scout** visits, shows photo ID at the office, and uploads one video. Upload is only possible after the tour is Paid.
6. **Customer** watches the video.

Customers can cancel a tour until it is completed. The apartment office can decline a tour.

Tour statuses: `Requested` → `Accepted` → `Scheduled` → `Completed`, or `Cancelled` / `Declined`.

## Run it locally

You need Node.js 18 or newer. SeeFirst is two small apps from one codebase. They run on two ports and share the same `data/` and `uploads/` folders, so a request made by a customer shows up for scouts right away.

```
npm install
npm run customer   # terminal 1: customers at http://localhost:3000
npm run staff      # terminal 2: scouts and apartment offices at http://localhost:3001
```

`npm run dev` is the same as `npm run customer`. Both apps must run on the same machine from the same folder.

If something fails with an `esbuild` message, run `npm install-scripts approve esbuild` and try again.

## Pages

| URL | Who |
|---|---|
| `http://localhost:3000/` | Customer landing page with Log in and Register |
| `http://localhost:3000/user` | Customer login, registration and dashboard |
| `http://localhost:3001/` | Staff landing page with the scout and apartment logins |
| `http://localhost:3001/scout` | Scout login, registration and dashboard |
| `http://localhost:3001/apartments` | Apartment office login and dashboard |

Each page keeps its own login in the browser.

## Payment (Venmo)

Payment is an honor system with no payment API. When the apartment confirms a time, the customer sees a **Pay $20 on Venmo** button that opens Venmo with the amount and a note filled in, and an **I've paid** button. You check your Venmo yourself, and pay the scout their $15 yourself.

Set your username at the top of `src/App.jsx`:

```js
const VENMO_HANDLE = 'your-venmo-username'
```

## Accounts

- **Customers and scouts** register themselves on their login page (first name, last name, phone, email, password). Any password is accepted.
- **Apartment offices** cannot register. Two demo accounts are in `data/users.json` (password `pass`):
  - `cortlandallenstation@seefirst.test` — Cortland at Allen Station
  - `cortlandnorthplano@seefirst.test` — Cortland at North Plano

To test the whole flow, register a customer (port 3000) and a scout (port 3001), request a tour, and then log in as the matching apartment office (port 3001).

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
| `POST /api/tours/:id/pay` | Customer says they paid (tour must be Scheduled) |
| `POST /api/tours/:id/video` | Scout uploads the video, only after Paid (marks it Completed) |
| `POST /api/tours/:id/cancel` | Customer cancels |
| `POST /api/tours/:id/decline` | Apartment office declines |

## Deploying (for demos)

Each app is one Node process that runs the Vite dev server inside Express. Because the two apps share files, they only work together on one machine. On a host like Render only one app runs per service (`npm run dev` starts the customer app), and two separate services would not share data. Sharing across hosts would need the staff app to call the customer app's API, which is not built.

On a host like Render:

- Build command: `npm install`
- Start command: `npm run dev`
- No environment variables needed. The host sets `PORT`, which the server uses.

Free hosts usually have temporary disks and put the app to sleep when idle, so registered users, tours and videos can disappear on restart or redeploy.

## Known limitations

This is a prototype, so it skips a lot on purpose:

- No real authentication. The browser sends a user ID the server trusts, and the server does not check roles on every action.
- Passwords are stored as plain text, and the login response includes the password.
- Uploaded videos have public links and no size or type limits.
- Payments are not verified: the customer's "I've paid" click is trusted. No scout payouts.
- No scout ID verification, notifications or scheduling checks.
- The JSON files can be overwritten if two people act at the same moment.
- Property names are real, but rent, size and amenities are placeholder data.

Do not use real personal data in this app.
