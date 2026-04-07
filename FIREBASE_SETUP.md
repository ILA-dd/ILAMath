# Firebase Setup

## 1. Fill web config

Open Firebase Console -> Project settings -> Your apps -> Web app -> SDK setup and configuration.

Copy the config values into [`firebase-config.js`](./firebase-config.js).

## 2. Enable Authentication

In Firebase Console:

1. Open `Authentication`
2. Open `Sign-in method`
3. Enable `Email/Password`

## 3. Create Firestore

In Firebase Console:

1. Open `Firestore Database`
2. Create database
3. Start in production mode or test mode

## 4. Firestore rules

Paste these rules into Firestore Rules:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /profiles/{userId} {
      allow read: if true;
      allow create, update: if request.auth != null && request.auth.uid == userId;
    }

    match /usernames/{username} {
      allow read: if true;
      allow create, update, delete: if request.auth != null;
    }

    match /meta/{docId} {
      allow read: if true;
      allow create, update: if request.auth != null;
    }
  }
}
```

## 5. Redeploy

After saving config and enabling Firebase services, redeploy the site on Vercel.
