# ILAMath Profiles

This repo is ready for a static Vercel deployment with Firebase Auth + Firestore.

## Stack

- Public pages stay static: `/`, `/main`, `/settings`, `/profile`, `/markdown`
- Auth uses Firebase Authentication
- Profiles and public pages use Cloud Firestore
- Frontend Firebase config is stored in [`firebase-config.js`](./firebase-config.js)

## Firebase setup

Follow the full guide in [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md).

## Local development

For local development with Firebase:

1. Fill [`firebase-config.js`](./firebase-config.js)
2. Open the site locally or deploy it to Vercel

The old Node server and `api/` folder can stay in the repo, but the frontend no longer depends on them for auth or profile storage.
