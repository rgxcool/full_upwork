# Database migrations (#126)

Every change to stored data goes here as a numbered file. Each database keeps a ledger
(`migrations` collection) of what has run on it, so every environment catches up by itself:
`deploy.sh` runs `pnpm --dir backend run migrate` on every deploy, after the build and before
the new version goes live. If a migration fails, the deploy stops and the live version stays.

## Commands (from `backend/`)

```bash
node scripts/migrate.js            # apply pending migrations (pnpm run migrate)
node scripts/migrate.js status     # applied and pending
DRY_RUN=1 node scripts/migrate.js  # what would run; changes nothing
```

The backend logs a warning at startup when migrations are pending (e.g. after a manual `git pull`).

## Writing one

File: `NNNN-short-name.js` (next free number, lowercase, dashes), e.g. `0001-add-course-language.js`:

```js
// What it changes and why (issue number + title).
export const description = "Courses get a language field (default 'sv')";

export async function up(db, { logger }) {
    // db is the native MongoDB Db. Use the driver, not the Mongoose models: models change
    // over time, a migration must keep working against the data as it was.
    const res = await db.collection("courses").updateMany(
        { language: { $exists: false } },
        { $set: { language: "sv" } }
    );
    logger.info?.(`courses updated: ${res.modifiedCount}`);
}
```

## Rules

1. **Idempotent.** Running it twice changes nothing the second time (filter on the old shape).
2. **Safe on an empty database.** A fresh database (`make fresh`, a new collaborator) runs every
   migration from 0001.
3. **Additive: expand now, contract later.** `deploy.sh` can roll the *code* back, never the data.
   Add new fields and keep the old ones until a later release no longer reads them; remove them in
   a separate, later migration.
4. **No personal data in logs**: counts and ids only (CLAUDE.md §4).
5. **Never edit or renumber a migration that has been merged.** Write a new one.
6. **Test it** in `backend/tests/integration/` against mongodb-memory-server: old shape in,
   new shape out, and a second run is a no-op.
