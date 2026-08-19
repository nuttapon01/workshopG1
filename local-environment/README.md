# local-environment — a database, and nothing else

This folder is **not** your project. It exists so you have a PostgreSQL 15 running on your own
machine, and nothing more. There is no `package.json` here, no framework, no test runner, no
lint config — because choosing those is Application Design's job, and handing them to you would
be handing you the answer to a question the workflow is supposed to ask.

## Use it

```
docker compose up -d      # PostgreSQL 15; the first run pulls the image, ~30 s
docker compose ps         # must say "healthy"
node check-db.mjs         # "database is up."
```

Then leave it running and go back up a level. Your project root is the **group folder**, not
this one.

| | |
|---|---|
| Connection | `postgres://pointhub:pointhub@localhost:5432/pointhub` |
| Read it from | `DATABASE_URL` in the environment — never hard-code it |
| Port already taken? | change the left-hand number in `docker-compose.yml`, then set `PGPORT` for the check and `DATABASE_URL` for your app |
| Stop it | `docker compose down` (keeps the data) |
| Start over | `docker compose down -v` (throws the data away) |

`check-db.mjs` uses the Node standard library only. It confirms something is listening on the
port — it deliberately does not pick a database driver for you.

## Your project

Create it in the group folder, one level up. Node 20 and PostgreSQL 15 are the platform
standards (`../technical-environment.md`); everything else — framework, layout, test runner,
how you reach the database — is a decision for you to make and record.

Nothing is deployed. The workshop ends at working, tested code running on this laptop.
