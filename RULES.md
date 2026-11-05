# Framework rules

Conventions for every app built on `@compean/core`. They apply on top of the `code-rules` skill, which holds the design principles (from *A Philosophy of Software Design*) these rules are derived from; read that first. Each rule here is written once; the section number in brackets points to the principle behind it.

A rule a tool can check is enforced by `@compean/core/eslint` and listed in [Enforced by lint](#enforced-by-lint). A new kind of file, a new dependency direction or an exception to a rule needs a design decision before code, not a local workaround.

## Glossary

| Term | Meaning |
|---|---|
| **Domain** | The pure TypeScript that both client and server agree on: models, schemas and policies in `packages/domain`. No I/O, no runtime imports, no display text. |
| **Model** | A domain concept: its readonly Zod schema, its type, and the pure functions that define its terms (`isKept`, `isPathComplete`). File: `*.model.ts`. |
| **Schema** | A validation shape that isn't a domain concept, such as a request body or a form's input. File: `*.schema.ts`. |
| **Policy** | A pure behaviour decision: "what should the app do?" (`shouldPromptForReview`, `recommendNextPaths`). Never creates, changes or stores anything. File: `*.policy.ts`. |
| **Service** | A class that performs operations and may hold shared state, reached through `$S`. Exists on the client and on the server. File: `*.service.ts`. |
| **Controller** | Client-only. Owns one screen's logic and state; its `state` is the screen's view model. Runs on web and mobile unchanged. File: `*.controller.ts`. |
| **View model** | The display-ready values a screen renders. Normally a controller's `state`; a `*.view-model.ts` file exists only when two or more controllers build the same display shape. |
| **Screen** | The component a route renders. Calls `useController` once and renders its state. |
| **Routes** | Server-only. A chained Hono definition of a feature's HTTP endpoints. File: `*.routes.ts`. The word "controller" is never used for this. |
| **Repository** | Server-only. Holds queries only when they are deep (joins, mapping, transactions) or shared by two or more services. File: `*.repository.ts`. |
| **Port / adapter** | The boundary with something we don't control (device storage, a third-party SDK) and its implementation. Files: `*.port.ts`, `*.adapter.ts`. |
| **`$S`** | The service registry. `register(Class, instance)` in `boot.ts`; `$S(Class)` everywhere else it's allowed. |
| **`boot.ts`** | The composition root of each app: the one place that builds services and wires their dependencies. |
| **`UserError`** | An error the user can fix or should be told about. Its message is shown verbatim. Everything else is a bug. |
| **Resource** | A typed name (`'applications'`) for a kind of server data, used to mark cached data stale. |

## File roles

These eleven suffixes are the only ones. The folder is the feature; the suffix is the role.

| Where | Suffix |
|---|---|
| `packages/domain` | `*.model.ts`, `*.schema.ts`, `*.policy.ts` |
| `packages/client` | `*.controller.ts`, `*.service.ts`, `*.view-model.ts` |
| `apps/api` | `*.routes.ts`, `*.service.ts`, `*.repository.ts` |
| any app | `*.port.ts`, `*.adapter.ts`, plus `boot.ts`, `app.ts`, `server.ts` |
| tests | `*.test.ts` next to the file under test |

Code that would need another suffix goes where its knowledge lives: mapping goes with the module that knows the format, construction and changes go in the owning service, animation sequences go in the view, display text goes in the controller.

## Layout

```
apps/web/          Vite + TanStack Router: routes/, screens/, adapters/, boot.ts
apps/mobile/       Expo Router, same shape (added when needed)
apps/api/          Hono on Node: features/<feature>/, migrations/, app.ts, server.ts, boot.ts
packages/domain/   models, schemas, policies
packages/client/   features/<feature>/: controllers, client services, shared view models
```

- **pnpm workspaces**, pinned with `packageManager`. **Node** is the only runtime, for the server, tests and scripts.
- Dependencies point one way: `apps → packages/client → packages/domain`, and `apps/api → packages/domain`. `packages/client` imports only `type AppType` from the API, never its code. [§9.4]
- Folders are grouped by feature inside each app or package, never by role. [ch. 9]
- `@compean/core` entry points: root (`Observable`, `Controller`, `$S`, `register`, `UserError`, `ToastService`, `Form`, `ErrorReporter`, `changed`), `/react` (`useController`, `<Toaster />`), `/server` (the `app.onError` handler, `loadConfig`), `/testing` (`useTestDatabase`, `resetServices`, recording fakes).

## Domain

- Every domain type is a readonly Zod schema in a `*.model.ts`; its type comes from `z.infer`. [§5.3, §9.1]
- A definition of a domain term lives with its model once two modules, or both client and server, need it. Until then it stays a private function in the module that uses it. [§9.3]
- A policy is a pure behaviour decision in the book's sense: mechanism and policy kept apart. [§6, §8.2]
- Display text and constants that only one screen uses stay out of the domain.

## Controllers

- A controller extends `Controller<TState>`. It exposes `state`, `initialize()` and its actions; the base class provides `subscribe`, `dispose`, `notify()`, `track(cleanup)` and `run(task)`.
- `state` holds display-ready values only. Building them is private mapping inside the controller. [§7.4, §9.1]
- Every action that does async work runs through `run()`. `run()` sets the loading and error status, shows a `UserError`'s message as a toast once the screen has loaded, shows a generic message for anything else, and reports bugs. Controllers write no `try/catch`. [§10.7]
- An action must add something: `run()`, a state change, or combining services. One that only forwards a call is a pass-through. [§7.1]
- Every decision that reads app state is made in the controller, in a method called directly where the data arrives (for example at the end of `load()`). Subscribe to a service only when the change comes from outside. [§18.2]
- Controllers import no React, React Native or router package. They hold no animation values, springs, animation timers or haptics; they expose meaningful state (`phase`, `isRevealed`) and the view animates it. Timing that is behaviour (auto-advance after 3 s) stays in the controller and never copies an animation's duration. When the flow waits for an animation, the view calls a method named by what the user saw (`planRevealed()`). [§5.2, §9.4]
- Services come from `$S`. The constructor takes only what the screen owns, in this order: route params, then navigation, each only when needed. [§7.5]
- Success messages: `$S(ToastService).show('Moved to Technical')` after the action succeeds. Only actions announce success; loading data never does.
- Forms: the controller holds a `Form` built from a domain schema, exposed as `public readonly`, and subscribes to it in `initialize()`. Submit with `this.run(() => this.form.submit(async (input) => { ... }))`; the action runs only when the input is valid. Clear the form only after the action succeeds. Field errors show on blur or submit. [§19.6, §10.1]

### Navigation

- When the destination is knowledge the screen owns (a row's detail, a menu item, back), the screen uses `<Link>` or its router directly.
- When it comes from a rule, a result or a flow order, the controller decides. It declares a small navigation interface named by destination (`toResumeVersion(id)`, `back()`), and the screen implements it with its platform's router and passes it in. The order of a flow lives in a policy. [§9.4, §6.2]
- A navigation implementation only navigates.
- Every navigation interface has a one-line comment: `/** Where this screen can lead after an action. Implemented by each platform's screen. */` [§13.5]

## Screens

- The screen calls `useController` once and renders `state`. Its sections receive `state` and `controller` as props; avoid passing them through components that don't use them. [§7.5]
- `useEffect`, `useFocusEffect` and `useState` are for view work only: focus, gesture timing, scroll and animation values, keyboard listeners, view-only toggles.
- Screens show no toasts or alerts and catch no errors.
- Animation, haptics and sound live in the view. `<Toaster />` at the app root owns how toasts look.

## Web routes

- Vite + TanStack Router with file-based routes. A route file holds the path, `validateSearch` with a domain schema, and the screen.
- Routes never use loaders or the router cache; controllers load data through services.
- `beforeLoad` is used only for access checks, reading `$S(AuthService)`.

## Services

- A service extends `Observable` only when screens must react to its changes live; otherwise it's a plain class. [§19.1]
- Its interface speaks the domain: one named snapshot for displayed data, intent methods instead of setters, question methods only for domain rules several callers share. A getter per field is a red flag. [§19.6, §5.1]
- A library (Zustand, query-core, Better Auth) may live inside a service, never in screens or controllers. [§5.1]
- Dependencies come through the constructor, every argument named, no `undefined` placeholders. A default must be what production wants, so only `{ clock, random }` default (to the real ones) and a dependency never defaults. Product constants live in the module that owns the rule. [§8.2, §10.9]

### Server data on the client

- A client service calls the typed `hc<AppType>` client directly; there's no port around our own API. It caches with a private `QueryClient` from `@tanstack/query-core`. Query keys, cache options and request status never leave the service. [ch. 8, §7.3]
- Queries declare what they're built from: `meta: { dependsOn: ['applications'] }`. After a write, the service calls `changed(cache, 'applications')`. A writer never knows who reads. [§5.2]
- Temporary network failures are retried inside the cache. [§10.6]
- `readJson` turns a 4xx `{ message }` into a `UserError` and a 5xx into a plain `Error`.

## Server

- A feature's routes are one chained `Hono` export: path, `zValidator` with a domain schema, one service call, an explicit status code. No route classes, no rules, no database calls. [ch. 7]
- `app.ts` chains every feature's routes and exports `AppType`. `server.ts` mounts it under `/api` with `@hono/node-server`.
- Services are classes with the feature's rules. They never read the HTTP context; routes pass `c.var.user.id` and validated input explicitly. [§5.1]
- A service holds its own queries by default. A `*.repository.ts` exists only when its abstraction differs (joins, mapping rows into shapes, transactions) or two or more services share it. Writes that touch several tables run in one transaction inside the module that knows the tables. [§9.6, ch. 8]
- Services return model types, never rows typed by the database schema, so the schema can't leak into `AppType`. [§5.2]
- PostgreSQL, raw SQL through `postgres`, checked by SafeQL against the real schema. Migrations are plain `.sql` files run by dbmate, reviewed before merge.
- Auth: Better Auth mounted in `app.ts`, with a `withSession` middleware that sets `c.var.user`. Its tables arrive as a reviewed migration. Who may do what is decided in services or policies; something the user may not see is reported as not found (`UserError(..., 404)`).

## Errors

- One class, `UserError(message, status)`, on both sides. Write the message where the cause is known. [§10.7]
- First try to define the error away: deleting something already gone succeeds, moving to the current stage does nothing. [§10.3]
- `app.onError` is the only place errors become HTTP: a `UserError` becomes `{ message }` with its status; anything else is reported and answered with a 500 and a generic message. Input validation errors take the same path.
- Unrecoverable problems at startup (missing config, no database) crash `boot.ts` immediately with a clear message. [§10.8]
- No `try/catch` in routes, controllers or screens.

### Reporting bugs

- `ErrorReporter.report(error, { where, userId? })`, registered in each app's `boot.ts`: `ConsoleReporter` locally and in tests, a `SentryReporter` adapter in production. All apps report to one Sentry project. [§7.2]
- Only `run()` and `app.onError` call it, and never for a `UserError`.
- `report()` never throws; if the destination fails it falls back to the console. [§10.6]

## Tests

- Vitest on Node for everything except end-to-end flows.
- Models and policies: plain unit tests.
- Controllers: unit tests with typed fakes registered in `$S`, no React rendering.
- Services and repositories: integration tests against a real Postgres, a fresh database per test file cloned from a migrated template. Setup fails loudly when `TEST_DATABASE_URL` is missing.
- Routes: a few `app.request()` tests per feature, which also exercise `app.onError`.
- Screens: a few Playwright flows for the key journeys.
- Every test starts with `resetServices()`; tests in one file don't run concurrently. [§7.5]
- Design the abstraction first, then its tests. A bug fix starts with a test that fails because of the bug. [§19.4]

## Enforced by lint

`@compean/core/eslint` checks:

- Controllers and `packages/client` import no React, React Native, `@tanstack/react-router` or `expo-router`.
- `packages/domain` imports nothing outside itself and Zod.
- Route files define no `loader`.
- Only the auth service imports `better-auth`; only client services import `@tanstack/query-core`.
- SQL in `apps/api` passes SafeQL.
