---
project: unstuck
plan_created: 2026-05-27
target_platform: cloudflare-workers-pages
target_url_template: "https://unstuck.<account>.workers.dev or *.pages.dev"
status: executed # draft → approved → executed
approved_at: 2026-05-27T10:08:57Z
executed_at: 2026-05-27T14:19:00Z
prerequisites_state: complete # not_started → in_progress → complete
deploy_state: success # not_started → in_progress → success → failed
deployed_url: https://unstuck.lukasz-rdzanek.workers.dev
worker_version_id: d21d3a4e-dfd7-4f0b-bdbb-e06d42061d55
deviations_from_plan:
  - "Phases 2.2 and 3 swapped: secrets cannot be set on a non-existent Worker. Real order was deploy (Phase 3) → secrets (Phase 2.2). Worker reads secrets at request time so no re-deploy needed."
  - "Worker renamed: wrangler.jsonc name changed from '10x-astro-starter' (starter default) to 'unstuck' (per project_name in tech-stack.md) so the deployed URL aligns with the project identity."
  - "KV Namespace 'unstuck-session' auto-provisioned by wrangler at first deploy (binding env.SESSION declared by the starter for session storage). Was not pre-flagged in the plan — surfaced as a hidden prerequisite handled automatically."
inputs:
  - context/foundation/infrastructure.md
  - context/foundation/tech-stack.md
  - context/foundation/prd.md
acceptance_criteria: # all met 2026-05-27
  - "[MET] Production URL responds 200 on `/` (0.21s)"
  - "[MET] `/auth/signup` accepts a test signup; prod-test@example.com appears in Supabase auth.users"
  - "[MET] `/auth/signin` works for that test user (dashboard reached authenticated)"
  - "[MET] `/dashboard` reachable only when signed in (302 → /auth/signin otherwise)"
  - "[MET] No errors surfaced during the verification session"
---

# Pierwsze wdrożenie Unstuck — plan

Cel: zdeployować MVP na Cloudflare Pages/Workers i zweryfikować, że pełny przepływ auth działa end-to-end. Status na koniec planu: publiczny URL, działający signup i sign-in, czysty `wrangler tail`.

Plan jest podzielony na **6 faz**. Każda faza ma czytelną etykietę kto co robi:

- **[YOU]** — kroki, których ja (agent) nie mogę wykonać (zakładanie kont, OAuth, decyzje wymagające Twojego e-maila / hasła).
- **[ME]** — kroki, które ja uruchamiam u siebie po Twoim "go" (komendy CLI, sprawdzenia stanu, edycje konfiguracji).
- **[BOTH]** — kroki gdzie podajesz mi wartość (np. sekret z Supabase dashboardu), a ja wykonuję komendę.

## Faza 0 — Setup kont (~15 min) [YOU]

Wszystko ręczne. Wymaga Twojego e-maila do rejestracji.

### 0.1 — Cloudflare

1. Wejdź na **dash.cloudflare.com**.
2. **Sign Up** z dowolnym e-mailem (free tier wystarczy na cały MVP).
3. Po weryfikacji e-maila zaloguj się.
4. Zapisz w pamięci (lub w 1Password): nazwa konta = "<Twoje konto>", login account ID widoczny w sidebar.

**Acceptance:** umiesz wejść na dash.cloudflare.com i widzisz pusty panel "Workers & Pages".

### 0.2 — Supabase

1. Wejdź na **supabase.com** → **Start your project**.
2. Załóż konto przez e-mail lub GitHub.
3. **New project** w domyślnej organizacji. Wypełnij:
   - Project name: `unstuck`
   - Database password: wygeneruj silne hasło (Supabase ma generator), zapisz w 1Password — będzie potrzebne tylko przy migracjach
   - Region: **eu-central-1 (Frankfurt)** jeśli jesteś w EU, **us-east-1 (Virginia)** jeśli w US. Wybierz najbliżej, gdzie będą początkowi użytkownicy
   - Pricing plan: **Free** (zostawiamy domyślne)
4. Czekasz ~2 min na inicjalizację bazy.
5. Po inicjalizacji wejdź w **Settings → API**. Zapisz dwie wartości (do podania mi później w fazie 2.2):
   - `Project URL` — zaczyna się od `https://<ref>.supabase.co`
   - `Project API keys` → `anon` `public` — długi JWT zaczynający się od `eyJ...`
   - **NIE kopiuj `service_role` key** — to admin key, nie ma go w aplikacji.

### 0.3 — Wyłącz wymaganą weryfikację e-maila (lokal dev convenience)

W Supabase dashboard:

1. **Authentication → Sign In / Up → Email**.
2. Wyłącz **Confirm email** (toggle off).
3. To pozwoli na signup bez kliknięcia w mail confirmation — wygodne na development.
   Możesz włączyć z powrotem dla production później.

**Acceptance fazy 0:** masz konto Cloudflare, projekt Supabase utworzony, w pamięci jest URL projektu + anon key, email confirmation wyłączone.

---

## Faza 1 — Lokalna konfiguracja i smoke-test (~10 min)

### 1.1 — Aktywuj Node 22 [YOU, ale szybkie]

W swoim terminalu, w katalogu projektu:

```bash
cd "/Users/alpacainthecode/Documents/3. Projekty/10xDEVS"
nvm use     # podchwytuje 22.14.0 z .nvmrc
node -v     # powinno pokazać v22.14.0
```

Jeśli `nvm use` zgłasza brak wersji 22.14.0 (Node 22.22.3 mamy, ale .nvmrc pinuje 22.14.0):
```bash
nvm install 22.14.0
nvm use
```

### 1.2 — `.dev.vars` z lokalnymi sekretami [BOTH]

Cloudflare lokalny dev (wrangler) czyta sekrety z pliku `.dev.vars` (gitignored).

**Ty:** otwórz `.env.example`, skopiuj treść i pokaż mi swoje wartości URL/anon-key z Supabase (faza 0.2).

**Ja:** utworzę `.dev.vars` z Twoimi wartościami:

```bash
# .dev.vars (gitignored — secrets, never commit)
SUPABASE_URL=https://<twój-ref>.supabase.co
SUPABASE_KEY=eyJ...<twój anon key>
```

### 1.3 — Lokalny smoke-test [ME]

```bash
npm install        # idempotentnie, na wszelki wypadek
npm run dev        # uruchomi workerd dev server (Cloudflare-fidelity)
```

Powinno wystartować na `http://localhost:4321` (lub innym porcie pokazanym w outputie).

**Ty:** otwórz URL w przeglądarce, sprawdź:
- Strona startowa się ładuje
- `/auth/signin` i `/auth/signup` się ładują
- Spróbuj zarejestrować testowego użytkownika (np. `test@example.com` / `password123`)
- Po signup sprawdź w Supabase dashboard **Authentication → Users** — czy widzisz nowego usera

**Acceptance fazy 1:** lokalna aplikacja działa, signup zapisuje usera do Supabase, weryfikacja maila pominięta dzięki kroku 0.3.

---

## Faza 2 — Logowanie i sekrety production (~10 min)

### 2.1 — `wrangler login` [YOU]

W swoim terminalu (w katalogu projektu):

```bash
npx wrangler login
```

Otworzy się browser → wybierasz konto Cloudflare (to z fazy 0.1) → klikasz **Allow**. Po sukcesie wraca do terminala z "Successfully logged in."

**Dlaczego nie ja:** to interaktywny OAuth, wymaga Twojego browsera.

### 2.2 — Ustaw production secrets [BOTH]

Ja uruchomię, Ty potwierdzisz wartości w trakcie:

```bash
npx wrangler secret put SUPABASE_URL
# prompt: paste your secret → wkleisz URL z fazy 0.2
npx wrangler secret put SUPABASE_KEY
# prompt: paste your secret → wkleisz anon key z fazy 0.2
```

**Uwaga:** sekrety są zapisywane w Cloudflare i NIE są widoczne w plikach repo. Możesz je weryfikować przez `npx wrangler secret list` (pokaże nazwy, nie wartości).

**Acceptance fazy 2:** `npx wrangler whoami` pokazuje Twój e-mail; `npx wrangler secret list` pokazuje `SUPABASE_URL` i `SUPABASE_KEY`.

---

## Faza 3 — Pierwszy deploy (~5 min) [ME]

```bash
npm run build      # buduje Astro do dist/ z Cloudflare adapterem
npx wrangler deploy  # publikuje do Cloudflare Pages/Workers
```

Po sukcesie zobaczysz w outputie URL postaci:
- `https://unstuck.<account>.workers.dev` (jeśli Workers), lub
- `https://unstuck.pages.dev` (jeśli Pages)

**Ja:** przechwycę ten URL z outputu wrangler i zapiszę w finalnym raporcie.

**Możliwe niepowodzenia:**
- `EBADENGINE` — Node nie 22 → faza 1.1
- `Authentication failed` — sesja wrangler wygasła → faza 2.1
- `Unknown account` — wrangler.jsonc bez account_id → dodam ręcznie z `wrangler whoami`
- `nodejs_compat` missing — to flag w wrangler.jsonc; starter już go ma, ale weryfikuję przed deployem

---

## Faza 4 — Weryfikacja (~10 min) [BOTH]

### 4.1 — Smoke test publicznego URL [YOU]

Otwórz URL z fazy 3 w przeglądarce. Sprawdź wzrokowo:

1. Strona startowa się ładuje, layout poprawny.
2. `/auth/signup` — wypełnij i wyślij. Czy redirect na `/dashboard`?
3. **Pull do Supabase dashboard → Authentication → Users** — czy nowy user się pojawił z poprawnym e-mailem?
4. Wyloguj się (jeśli jest button) lub usuń ciasteczka. Wejdź na `/dashboard` — powinno zredirectować do `/auth/signin` (per FR-004 i resolved Open Question #2).
5. `/auth/signin` z tym samym userem — czy działa? Czy wraca na `/dashboard`?

### 4.2 — Sprawdzenie logów [ME, w trakcie kroku 4.1]

W osobnym terminalu uruchomię:

```bash
npx wrangler tail --format pretty
```

I obserwuję czy podczas Twojego klikania na produkcji nie lecą błędy 500, missing-env, czy CORS-y z Supabase.

### 4.3 — Acceptance criteria (z frontmatter planu)

Każde z poniższych musi być TRUE zanim uznamy deploy za "success":

- [ ] Production URL odpowiada 200 na `/`
- [ ] `/auth/signup` przyjmuje testowy signup; user widoczny w Supabase `auth.users`
- [ ] `/auth/signin` działa dla tego użytkownika
- [ ] `/dashboard` jest dostępne TYLKO po zalogowaniu (inaczej redirect do `/auth/signin`)
- [ ] Brak błędów w `wrangler tail` podczas sesji weryfikacji

Po przejściu wszystkich pięciu — zmieniam `deploy_state: success` w frontmatter tego planu i lecimy do fazy 6.

---

## Faza 5 — Rollback (jeśli faza 3 lub 4 zawiedzie) [ME]

Cloudflare zachowuje historię wersji. Rollback to dosłownie jedna komenda.

```bash
npx wrangler versions list           # pokazuje listę wersji z VERSION_ID
npx wrangler rollback <VERSION_ID>   # wraca traffic do wybranej wersji
```

Typowy time-to-revert: **<30 sekund**. Bez restartu, bez przerwy w działaniu.

**Ważne:** rollback Workera NIE cofnie migracji w Supabase. W MVP nie mamy żadnych migracji DB poza auth.users, więc to nie problem na ten deploy. Wpisuję do pamięci na przyszłość.

Jeśli sytuacja jest tak zła, że potrzebujemy całkowicie wycofać deploy (np. wrangler.jsonc niepoprawny) — możliwe ale rzadkie. Wtedy: `npx wrangler delete unstuck` (usuwa cały Worker) i deploy od zera.

---

## Faza 6 — GitHub + CI (opcjonalna, follow-up; ~10 min)

Według Twojej decyzji: **po** sukcesie kroku 4 weryfikacji.

### 6.1 — `gh auth login` [YOU]

```bash
gh auth login
# wybierz: GitHub.com → HTTPS → Login with browser
```

### 6.2 — Utwórz repo i zpushuj kod [ME]

```bash
gh repo create unstuck --private --source=. --push
```

Flag `--private` jest celowy: kod ma sekrety w historii potencjalnie (sprawdzę przed pushem). Jeśli chcesz publiczne — zmienisz na `--public` później.

### 6.3 — Dodaj GitHub repo secrets [BOTH]

CI workflow (`.github/workflows/ci.yml`) wymaga `SUPABASE_URL` i `SUPABASE_KEY` żeby zbudować pełny obraz. Dodatkowo dla deploy z CI potrzeba `CLOUDFLARE_API_TOKEN`.

**Ja:** uruchomię trzy komendy `gh secret set`.

**Ty:**
- `SUPABASE_URL` — taki sam jak w fazie 2.2
- `SUPABASE_KEY` — taki sam jak w fazie 2.2
- `CLOUDFLARE_API_TOKEN` — utwórz w **dash.cloudflare.com → My Profile → API Tokens → Create Token** z template "Edit Cloudflare Workers". Skopiuj token (pokazany tylko raz!) i podaj mi.

### 6.4 — Weryfikacja CI [BOTH]

```bash
git commit --allow-empty -m "chore: verify CI" && git push
gh run watch
```

CI powinno przebiec zielono (lint + build). Deploy z CI dodajemy w osobnym workflow w późniejszej fazie projektu.

---

## Co się zmienia w planie po `status: approved`

Kiedy zaakceptujesz ten plan (po Twoim review), aktualizuję frontmatter:

```yaml
status: approved
approved_at: <timestamp>
```

I dopiero potem ruszamy z fazą 0. Tylko Twój explicit "go" / "approved" / "wykonujemy" mnie ruszy.

Wszelkie zmiany w planie podczas egzekucji (np. odkryjesz w fazie 0.2 że jednak chcesz inny region Supabase) — zapisuję jako edycję tego pliku, z notką "[REVISED <timestamp>]" przy zmienionej sekcji. Plan = audit trail, nie tylko initial intent.

---

## Co plan NIE obejmuje

- **Custom domain** dla aplikacji (np. unstuck.app) — to oddzielne zadanie w późniejszej fazie, gdy będziesz miał domenę.
- **Email transactional** (welcome maile, password reset) — Supabase zapewnia podstawowe Auth maile out-of-the-box; advanced customization jest poza scope MVP.
- **Monitoring / APM** (Sentry, Datadog) — `wrangler tail` wystarczy na MVP scale; monitoring stack to v2.
- **Custom domain dla preview deploys** ani **Cloudflare Access** dla ochrony preview — z Risk Register infrastructure.md, do rozwiązania jak będziesz dzielił preview URLs z testerami.
- **Migracje DB Supabase** — w MVP korzystamy tylko z `auth.users` (built-in), nie ma własnego schematu. Migracje wejdą gdy dojdziesz do FR-005 / FR-006 (chat messages).
