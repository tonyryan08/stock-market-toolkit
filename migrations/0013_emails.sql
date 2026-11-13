-- Week 12 (decision 23): the real student logins. Cloudflare Access stands in
-- front of the whole site (the Worker's Access tab, "All traffic"; an email
-- one-time code for the enrolled addresses). The Worker is handed the signed-in
-- email and matches it to the student row: an account carries its student's
-- email, set by the tutor at enrolment (`npm run enrol -- --email`) or later
-- (`--set-email CODE EMAIL`). Nullable: an unlinked account still has its code,
-- and while Access is off the code is the key as it was from week 8.
-- No index (0002's lesson): the table is a class, not a universe; the lookup
-- is `lower(email) = lower(?)`, and the enrol script refuses a duplicate.
ALTER TABLE students ADD COLUMN email TEXT;
