# PocketBase Sync Setup

DragonFly supports optional team sync via a self-hosted [PocketBase](https://pocketbase.io/) instance. All data is AES-GCM encrypted on the client before transmission — the server only ever stores ciphertext.

Sync is opt-in and per-project. You can use DragonFly fully offline without it.

---

## Quick Start with Docker

```bash
git clone https://github.com/Limozacloud/dragonfly.git
cd dragonfly/docker
docker compose up -d --build
```

PocketBase will be available at `http://localhost:8080`.

The `Dockerfile` downloads PocketBase directly from the [official releases](https://github.com/pocketbase/pocketbase/releases). To use a different version, edit the `PB_VERSION` arg in `docker/Dockerfile`.

---

## Create an Admin Account

```bash
docker exec dragonfly-pb /pb/pocketbase superuser create admin@example.com YOUR_PASSWORD
```

Or open the Admin UI at `http://localhost:8080/_/` and create an account there.

---

## Connect DragonFly

In the app, go to **Settings → Sync** and fill in:

| Field | Value |
|-------|-------|
| Server URL | `http://<your-server-ip>:8080` |
| Admin Email | The superuser email from above |
| Admin Password | The superuser password from above |
| Space Key | A shared encryption passphrase for your team |

Click **Setup Server** — DragonFly automatically creates all required PocketBase collections and a sync user.

---

## Team Access

Share the **Server URL** and **Space Key** with your team members. They configure the same values in their Settings → Sync and click **Setup Server** (or **Connect** if the server is already set up).

- Each device keeps a full local copy of all data
- Sync runs in the background when connected
- The Space Key never leaves the client — it is only used locally for encryption/decryption

---

## Production Deployment

For a server deployment (VPS, home server, etc.):

- Put PocketBase behind a reverse proxy (nginx, Caddy) with HTTPS
- Use a strong, random Space Key
- Back up the `pb_data` volume regularly
- The PocketBase Admin UI should not be publicly exposed in production

A minimal Caddy config:

```
your-domain.com {
    reverse_proxy localhost:8080
}
```
