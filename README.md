# ApplyFlow AI 🚀

> AI-powered job application assistant — auto-discovers jobs, writes personalized emails, tracks your applications.

---

## What This App Does

1. **You sign up** and enter your job preferences (roles, location, tech stack)
2. **AI finds jobs** from Indeed that match your profile
3. **You browse** job cards and click "Mark Applied" after applying on the company's site
4. **AI generates** a personalized cold email to the recruiter
5. **The email sends** via your connected Gmail
6. **You track** every application with status updates in the tracker table

---

## Tech Stack

| Layer | Tool |
|---|---|
| Frontend | React + Vite (JavaScript) |
| Backend | Vercel Serverless Functions |
| Database + Auth | Supabase |
| AI | OpenAI GPT-4o mini |
| Email | Gmail API (OAuth2) |
| Hosting | Vercel |

---

## Project Structure

```
applyflow/
├── client/
│   ├── index.html          ← HTML entry point
│   ├── vite.config.js      ← Vite configuration
│   ├── package.json        ← Frontend dependencies
│   └── src/
│       ├── main.jsx        ← React app entry point
│       ├── App.jsx         ← All UI components
│       ├── auth.js         ← Supabase auth helpers
│       ├── api.js          ← API call helpers
│       └── styles.css      ← All styles
│
├── api/
│   ├── jobs.js             ← Job discovery from Indeed
│   ├── ai.js               ← OpenAI contact finding + email gen
│   └── email.js            ← Gmail OAuth + sending
│
├── schema.sql              ← Run this in Supabase SQL Editor
├── vercel.json             ← Vercel deployment config
├── package.json            ← Root dependencies
├── .env.example            ← Copy this to .env.local
└── README.md               ← You are here
```

---

## Setup Guide (Zero to Running in ~30 Minutes)

### Prerequisites
- A computer with [Node.js](https://nodejs.org) installed (version 18+)
- A [GitHub](https://github.com) account (free)
- A credit card for OpenAI (pay-as-you-go, very cheap for testing)

---

### Step 1: Get the Code

```bash
# Clone the repo (or download as ZIP from GitHub)
git clone https://github.com/YOUR_USERNAME/applyflow-ai.git
cd applyflow-ai

# Install all dependencies
npm run install:all
```

---

### Step 2: Set Up Supabase (Database + Auth)

Supabase is a free backend-as-a-service. It handles your database and user authentication.

1. Go to **[supabase.com](https://supabase.com)** and click **"Start your project"**
2. Sign up with GitHub (easiest)
3. Click **"New Project"**
   - Give it a name: `applyflow-ai`
   - Set a strong database password (save this!)
   - Choose a region close to you
   - Click **"Create new project"** (takes ~2 minutes)

4. **Run the database schema:**
   - In your project, click **"SQL Editor"** in the left sidebar
   - Click **"New query"**
   - Open the `schema.sql` file from this project
   - Copy all the SQL and paste it into the editor
   - Click **"Run"** (the green button)
   - You should see "Success. No rows returned."

5. **Enable Email Auth:**
   - Go to **Authentication → Providers** in the left sidebar
   - Make sure **Email** is enabled (it is by default)

6. **Get your API keys:**
   - Go to **Settings → API** in the left sidebar
   - Copy **Project URL** → this is `VITE_SUPABASE_URL` and `SUPABASE_URL`
   - Copy **anon / public key** → this is `VITE_SUPABASE_ANON_KEY`
   - Copy **service_role / secret key** → this is `SUPABASE_SERVICE_ROLE_KEY`
   - ⚠️ Keep the service role key secret! Never put it in frontend code.

---

### Step 3: Set Up OpenAI

1. Go to **[platform.openai.com](https://platform.openai.com)** and create an account
2. Add a payment method (you'll use maybe $0.50 for testing)
3. Go to **API Keys** → **Create new secret key**
4. Copy the key → this is `OPENAI_API_KEY`
5. ⚠️ You can only copy it once, so save it immediately!

---

### Step 4: Set Up Gmail OAuth (for Email Sending)

This lets the app send emails from your Gmail account.

1. Go to **[console.cloud.google.com](https://console.cloud.google.com)**
2. Create a new project: click the project dropdown → **"New Project"** → name it `applyflow`
3. Enable the Gmail API:
   - Search for "Gmail API" in the top search bar
   - Click on it → click **"Enable"**
4. Create OAuth credentials:
   - Go to **APIs & Services → Credentials**
   - Click **"Create Credentials"** → **"OAuth client ID"**
   - If prompted, configure the OAuth consent screen first:
     - User Type: External
     - App name: ApplyFlow AI
     - Your email for support
     - Save and continue through the steps
   - Application type: **Web application**
   - Name: `ApplyFlow AI`
   - Authorized redirect URIs: Add `https://YOUR_APP.vercel.app/api/email`
     (You'll update this after deploying to Vercel)
   - Click **"Create"**
5. Copy **Client ID** → `GOOGLE_CLIENT_ID`
6. Copy **Client Secret** → `GOOGLE_CLIENT_SECRET`
7. Set `GOOGLE_REDIRECT_URI` to `https://YOUR_APP.vercel.app/api/email`

---

### Step 5: Create Your .env.local File

```bash
# In the project root, copy the example file
cp .env.example .env.local
```

Open `.env.local` and fill in all the values you collected:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/email
```

---

### Step 6: Run Locally

```bash
# Start the development server
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

You should see the ApplyFlow AI login screen! Try creating an account.

---

### Step 7: Deploy to Vercel

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Initial ApplyFlow AI setup"
   git push
   ```

2. Go to **[vercel.com](https://vercel.com)** → Sign up with GitHub

3. Click **"Add New Project"** → import your GitHub repo

4. Vercel will auto-detect the settings from `vercel.json`

5. **Add environment variables:**
   - In the Vercel project settings, go to **"Environment Variables"**
   - Add each variable from your `.env.local` file
   - For `GOOGLE_REDIRECT_URI`, use your actual Vercel URL: `https://your-app.vercel.app/api/email`

6. Click **"Deploy"** 🚀

7. **Update Google OAuth redirect URI:**
   - Go back to Google Cloud Console → Credentials
   - Edit your OAuth client
   - Add your Vercel URL to authorized redirect URIs
   - Save

---

## Using the App

### First Time
1. Sign up with your email
2. Fill in your job preferences (roles, location, tech stack)
3. Click **"Start Finding Jobs"**

### Finding Jobs
1. Click **"🔍 Find New Jobs"** on the dashboard
2. Wait ~10 seconds while AI scrapes Indeed
3. Job cards appear in a 5-column grid
4. Click "Show More" to reveal more cards

### Applying & Tracking
1. Click **"View Job ↗"** to open the job on Indeed/company site
2. Apply there (on their actual site)
3. Come back and click **"Mark Applied"** on the job card
4. This creates an entry in the Application Tracker below

### Sending Emails
1. In the Application Tracker, click the **envelope icon** on any row
2. The email modal opens with an AI-generated cold email
3. Edit the "To" field with the recruiter's email
4. Edit the email body if needed
5. Click **"Send"**
6. The email status updates to "Sent" in the tracker

### Connecting Gmail (First Email Send)
- The first time you try to send an email, you'll see a popup to connect Gmail
- Click the link, authorize ApplyFlow to send emails on your behalf
- You'll be redirected back and the email will send

---

## Cost Estimates

| Service | Free Tier | Typical Monthly Cost |
|---|---|---|
| Supabase | 500MB DB, 2GB bandwidth | Free for personal use |
| Vercel | 100GB bandwidth | Free for personal use |
| OpenAI | Pay-per-use | ~$1-5/month (light use) |
| Google Gmail API | Free | Always free |

---

## Troubleshooting

**"Jobs not loading"**
→ Check that your Supabase keys are correct in env vars
→ Check the Vercel function logs for errors

**"AI not generating emails"**
→ Check your OpenAI API key is valid and has credits
→ Check the Vercel function logs

**"Gmail not sending"**
→ Make sure your redirect URI in Google Cloud matches exactly
→ Try disconnecting and reconnecting Gmail

**"Can't log in"**
→ Make sure Email auth is enabled in Supabase Authentication settings

---

## Adding More Job Sources

To add a new job source (LinkedIn, Glassdoor, etc.):
1. Open `api/jobs.js`
2. Add a new scraping function similar to `scrapeIndeedJobs`
3. Call it in `discoverJobsFromIndeed`
4. The rest of the code (saving, scoring, display) works automatically

---

## Questions?

Open a GitHub issue or reach out. Happy job hunting! 🎉
