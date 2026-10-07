# Firestore Setup Guide for Customer Details Notes

## Issue: "Firestore not initialized" Error

This error typically occurs when Firestore queries need an **index** to function properly.

## 🔧 How to Fix

### Step 1: Go to Firebase Console
1. Visit: https://console.firebase.google.com
2. Select your project: **manti-jewel-art**
3. Go to **Firestore Database** (left sidebar)

### Step 2: Create the Required Index
1. In the Firestore console, look for an error message about a missing index
2. Or go to **Indexes** tab → **Composite Indexes**
3. Click **Create Index** and add:
   - **Collection**: `customerNotes`
   - **Fields**: 
     - `adminEmail` (Ascending)
     - `updatedAt` (Descending)

### Step 3: Verify Firestore Rules
1. Go to **Rules** tab
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow everyone to read/write products
    match /products/{document=**} {
      allow read, write;
    }
    // Allow everyone to read/write settings
    match /settings/{document=**} {
      allow read, write;
    }
    // Allow everyone to read/write activeUsers
    match /activeUsers/{document=**} {
      allow read, write;
    }
    // Orders stored from cart and quick-buy flows
    match /orders/{document=**} {
      allow read, write;
    }
    // Customer notes - only admin can access
    match /customerNotes/{doc} {
      allow read, write, delete: if request.auth != null && 
                                   request.auth.token.email == "vicky@manti.com" &&
                                   resource.data.adminEmail == request.auth.token.email;
      allow create: if request.auth != null && 
                       request.auth.token.email == "vicky@manti.com" &&
                       request.resource.data.adminEmail == request.auth.token.email;
    }
  }
}
```

4. Click **Publish**

### Step 4: Test in Your Browser
1. Hard refresh: `Ctrl+Shift+R`
2. Go to Admin Dashboard
3. Click "Customer Details" in sidebar
4. Should work now! ✅

## 📝 Troubleshooting

### Still seeing "Firestore not initialized"?
1. Open browser console: `F12`
2. Go to **Customer Details** tab
3. Share error messages showing in console

### "Permission denied" error?
- Make sure you're logged in as `vicky@manti.com`
- Check Firestore rules are published

### Notes not creating/saving?
- Verify Firestore rules allow `write` permission
- Check Firebase is initialized in `firebase-config.js`

