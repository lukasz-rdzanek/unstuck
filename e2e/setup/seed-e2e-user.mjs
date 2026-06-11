// Idempotent creation of the e2e login user against the LOCAL Supabase stack.
//
// The seeded auth.users in supabase/seed.sql have empty passwords (can't log
// in), and GoTrue needs an auth.identities row for password login — which the
// admin API sets up but raw SQL seeding does not. So we mint the login-capable
// `diagtest@local.dev` here, the same account the e2e specs + auth.setup.ts use.
//
// Locally it's a no-op (the account already exists). In CI's fresh stack it
// creates it. Run AFTER `supabase start`, BEFORE `npm run test:e2e`.
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const EMAIL = "diagtest@local.dev";
const PASSWORD = "password123";

const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});

if (error) {
  if (/already|registered|exists/i.test(error.message)) {
    console.log(`e2e user ${EMAIL} already exists — ok`);
  } else {
    console.error(`createUser failed: ${error.message}`);
    process.exit(1);
  }
} else {
  console.log(`created e2e user ${EMAIL} (${data.user?.id})`);
}
