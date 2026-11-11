# SeeFirst

See the apartment before you move. A local scout visits the apartment for you and records a video tour, and you watch it from home.

This is a bare-minimum prototype, not a production app. It has fake demo data.

## How it works

1. **Customer** picks a unit, sets a date range, and requests a video tour.
2. **Scout** sees the open request, accepts it with a free time window (for example 8am to 5pm), or declines it. A declined request stays open for other scouts.
3. **Apartment office** sees the customer and scout contact info, and picks the exact time (for example 10 to 11am).
4. *(Payment will be added here later.)*
5. **Scout** visits, shows photo ID at the office, and uploads one video. Upload is only possible once the apartment has confirmed a time.
6. **Customer** watches the video.

Customers can cancel a tour until it is completed. The apartment office can decline a tour.

Tour statuses: `Requested` → `Accepted` → `Scheduled` → `Completed`, or `Cancelled` / `Declined`.

## Run it locally

You need Node.js 20.12 or newer. SeeFirst is two small apps from one codebase. They run on two ports and share the same `data/` and `uploads/` folders, so a request made by a customer shows up for scouts right away.

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

## Email

When a scout accepts a tour, an email goes to the apartment, and the dashboard shows that address on the tour.

Settings live in the `.env` file in the project folder (it is private and ignored by git):

```
SMTP_USER=your-address@gmail.com
SMTP_PASS=your-16-letter-app-password
TEST_EMAIL=ankitbapatjob@gmail.com
SEND_TO_APARTMENTS=false
DATABASE_URL=          # optional: Supabase, see Deploying
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

- `SMTP_USER` and `SMTP_PASS` are the Gmail account that sends the emails and its app password. Without them, the email is only printed in the terminal and nothing breaks.
- With `SEND_TO_APARTMENTS=false`, every email goes to `TEST_EMAIL`. Set it to `true` to send to the real office addresses listed in `OFFICE_EMAILS` at the top of `server.js`.
- On Render's free plan, Gmail/SMTP is blocked, so the apartment email is not sent there (the tour still works).
- Restart the servers after changing `.env`. Needs Node 20.12 or newer.

## Accounts

- **Customers and scouts** register themselves on their login page (first name, last name, phone, email, password). There is no email check, so anyone can sign up with any address.
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
├── .env                 # private settings (email); not uploaded to git
├── data/
│   ├── apartments.json  # complexes and their units
│   ├── users.json       # accounts (apartment offices + anyone who registers)
│   └── tours.json       # all tour requests
├── uploads/videos/      # uploaded videos
└── src/
    ├── index.jsx
    ├── App.jsx          # landing page and all three dashboards
    └── styles.css
```

In local mode, state lives in the three JSON files and videos in `uploads/videos/`. With Supabase, the data lives in a `docs` table (one JSON document each for users, apartments and tours) and videos in the `videos` bucket. To reset the local demo, set `data/tours.json` to `[]`.

## API

| Endpoint | What it does |
|---|---|
| `POST /api/login` | Log in with email and password |
| `POST /api/register` | Create a customer or scout account |
| `GET /api/apartments` | List all units |
| `GET /api/tours` | Tours the logged-in role should see |
| `POST /api/tours` | Customer requests a tour |
| `POST /api/tours/:id/accept` | Scout accepts and gives a time window |
| `POST /api/tours/:id/scout-decline` | Scout declines an open request (it stays open for other scouts) |
| `POST /api/tours/:id/schedule` | Apartment office picks the exact time |
| `POST /api/tours/:id/video` | Scout uploads the video, only once the tour is Scheduled (marks it Completed) |
| `POST /api/tours/:id/cancel` | Customer cancels |
| `POST /api/tours/:id/decline` | Apartment office declines |

## Deploying (two URLs, shared database)

Customers and staff get separate URLs. Both apps use one Supabase project: a Postgres database for data and Storage for videos.

**1. Supabase (free)**
1. Create a project at supabase.com. Remember the database password you choose.
2. Storage > New bucket > name it `videos` and turn on **Public bucket**.
3. Project Settings > API: copy the **Project URL** and the **service_role** key (keep it secret).
4. Click **Connect** at the top, choose **Session pooler**, and copy the connection string. Replace `[YOUR-PASSWORD]` with your database password.

The first time the app starts, it creates the table and copies the starting data from `data/*.json` into the database.

**2. Render (free): make two Web Services from the same GitHub repo**

| | Customer service | Staff service |
|---|---|---|
| Build command | `npm install` | `npm install` |
| Start command | `npm run customer` | `npm run staff` |

Add the same environment variables to both: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SMTP_USER`, `SMTP_PASS`, `TEST_EMAIL`, `SEND_TO_APARTMENTS`. (The `.env` file is not uploaded to git.)

Render sets `PORT`, which the server uses.

**Local mode:** leave `DATABASE_URL` empty and the app uses `data/*.json` and `uploads/videos/` as before. To use Supabase locally, put the three Supabase values in `.env`.

Notes: free Render services sleep after 15 minutes idle, and a free Supabase project pauses after about a week without activity (restart it from the Supabase dashboard). Videos are limited to 50 MB.

## Known limitations

This is a prototype, so it skips a lot on purpose:

- No real authentication. The browser sends a user ID the server trusts, and the server does not check roles on every action.
- Passwords are stored as plain text, and the login response includes the password.
- Uploaded videos have public links, a 50 MB limit and no type checks.
- No scout ID verification, notifications or scheduling checks.
- Each list is saved as one document, so two people acting at the same moment can overwrite each other.
- Rent, size and amenities in `apartments.json` are placeholder data.

Do not use real personal data in this app.
