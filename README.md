# SoundsGood Mobile App (Expo)

## Setup
- `cd mobile_app`
- `npm install`

## Run
- `npm start`
- `npm run android`
- `npm run ios` (macOS required for local iOS builds; Expo Go works without a Mac)

## Build (EAS)
- Install CLI: `npm i -g eas-cli`
- Login: `eas login`
- Configure: `eas build:configure`
- Build:
  - Dev client: `eas build -p android --profile development`
  - Internal preview: `eas build -p android --profile preview`
  - Production: `eas build -p android --profile production`

Next steps:
- Firebase email/password auth + backend `/api/auth/firebase/sync` is implemented.
- Smoke test against staging: `npm run test:auth:staging`
- Implement audio capture (beep + noise profile)
- Upload → verify → auto-augment → auto-train
- Add Flappy game MVP
