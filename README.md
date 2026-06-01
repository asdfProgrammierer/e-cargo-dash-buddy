# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Mobile Build (Android APK)

Diese App kann als Capacitor-Android-App gebaut werden. Es gibt zwei Varianten:

- **Dev:** Hot Reload – die App im Emulator/Handy lädt den Code live aus der Lovable-Sandbox.
- **Prod:** Standalone-APK – der Code wird aus `dist/` gebündelt und läuft offline.

Gesteuert wird das über die Umgebungsvariable `CAP_ENV` in `capacitor.config.ts`.

### Voraussetzungen (einmalig)

```sh
npm install
npx cap add android   # nur falls der android/-Ordner noch fehlt
```

### Dev-Build (Hot Reload)

```sh
npm run cap:dev
npm run cap:open
```

In Android Studio dann auf Run drücken. Änderungen in Lovable erscheinen live.

### Production-Build (offline-fähige APK)

```sh
npm run cap:prod
npm run cap:open
```

In Android Studio:

- **Debug-APK:** Build → Build Bundle(s) / APK(s) → Build APK(s)
  Pfad: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Signierte Release-APK:** Build → Generate Signed Bundle / APK
  Dafür einmalig einen Keystore in Android Studio anlegen.

> Hinweis für Windows-Nutzer: `npm run cap:dev` setzt `CAP_ENV` per Inline-Syntax,
> die auf macOS/Linux funktioniert. Unter Windows stattdessen:
> `set CAP_ENV=dev && npx cap sync android`.
