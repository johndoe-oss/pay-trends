# Firebase Hosting Deployment Guide (FREE - No Billing Required)

## Prerequisites
- Node.js 18+ installed
- Firebase account created
- Firebase CLI installed (`npm install -g firebase-tools`)
- Supabase database already set up
- Paystack account configured
- Backend deployed on Render (free tier)

---

## Architecture (100% Free)

**Frontend:** Firebase Hosting (free)
**Backend:** Render (free tier) - `https://payjay-trends.onrender.com`
**Database:** Supabase PostgreSQL (free tier)

Firebase Hosting proxies API requests to Render, so everything works on one domain.

---

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter project name: `Traviblog`
4. Click **Continue** → **Create project**

---

## Step 2: Install & Login Firebase CLI

```bash
# Check version
npx -y firebase-tools@latest --version

# Login to Firebase
npx -y firebase-tools@latest login

# Verify login
npx -y firebase-tools@latest login:list
```

---

## Step 3: Link Project

```bash
# Use your Firebase project
npx -y firebase-tools@latest use Traviblog
```

---

## Step 4: Initialize Firebase Hosting

```bash
# Initialize Firebase in project directory
npx -y firebase-tools@latest init
```

**When prompted:**
- Select **Hosting** → Configure files for Firebase Hosting
- DO NOT select Functions (not needed for free tier)
- Use existing project: `Traviblog`
- Public directory: `public`
- Single-page app: **No**
- Don't overwrite `index.html`: **Yes**
- Use npm/yarn for dependencies: **Yes**

---

## Step 5: Build CSS

```bash
npm run build:css
```

---

## Step 6: Deploy to Firebase (Frontend Only)

```bash
# Deploy hosting only
npm run firebase:deploy
```

After deployment, Firebase will give you URLs:
- `https://traviblog.web.app`
- `https://traviblog.firebaseapp.com`

Your API requests will automatically proxy to Render backend.

---

## Step 7: Deploy Backend to Render (If Not Already Done)

Your backend is configured in `render.yaml`. To deploy:

1. Push code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Create new Web Service from your GitHub repo
4. Render will auto-detect `render.yaml`
5. Set environment variables in Render dashboard
6. Deploy

Your backend will be live at: `https://payjay-trends.onrender.com`

---

## How It Works

**Firebase Hosting** serves your frontend and proxies API requests:

```
User → https://traviblog.web.app/pj-secure-boutique/...
       ↓ (Firebase rewrites)
       → https://payjay-trends.onrender.com/pj-secure-boutique/...
       ↓ (Render backend)
       → Supabase PostgreSQL
```

Everything stays on free tiers:
- Firebase Hosting: 10GB storage, 10GB/month transfer
- Render: Free web service (with sleep after inactivity)
- Supabase: 500MB database, 2GB bandwidth

---

## Important Notes

1. **Database:** Supabase PostgreSQL (unchanged)
2. **Authentication:** Express JWT (unchanged)
3. **Payments:** Paystack integration (unchanged)
4. **Email:** SMTP via Nodemailer (unchanged)

5. **Cold Starts:** Render free tier sleeps after 15 min inactivity, first request takes ~30s
6. **No Billing Required:** Everything runs on free tiers

---

## Post-Deployment

1. Test all endpoints: `https://traviblog.web.app`
2. Monitor Render logs for backend errors
3. Monitor Firebase Hosting in Firebase Console

---

## Troubleshooting

**API requests fail:**
```bash
# Check Render backend is running
curl https://payjay-trends.onrender.com/pj-secure-boutique/get-shelf

# Check Firebase hosting
npx -y firebase-tools@latest hosting:channel:deploy preview
```

**Deployment fails:**
```bash
# Check Firebase status
npx -y firebase-tools@latest projects:list

# Redeploy
npm run firebase:deploy
```

---

## Rollback

```bash
# Rollback hosting to previous version
npx -y firebase-tools@latest hosting:clone Traviblog:previous-version Traviblog:live