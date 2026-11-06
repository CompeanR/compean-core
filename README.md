# @compean/core

The shared core of every Compean app: controllers, services, errors, forms, feedback messages and bug reporting, plus the ESLint rules that keep apps consistent. React web (Vite + TanStack Router), React Native (Expo) and a Hono API on Node all build on it.

**Read [`RULES.md`](RULES.md) before writing code in an app that uses this package.** It holds the conventions; this README only lists what the package exports.

## Install

```sh
pnpm add @compean/core zod
```

Optional peers, by entry point: `react` for `/react`; `prettier` for `/prettier`; `hono` and `@hono/zod-validator` for `/server`; `@tanstack/query-core` for `changed()`; `eslint` for `/eslint`. Requires Node 22.12 or later.

Bug reports from `load()` and `run()` name the controller by its class name, so production builds must keep class names: in Vite, set `esbuild: { keepNames: true }`.

## Entry points

| Import                   | Exports                                                                                                                                      | Used in                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `@compean/core`          | `Observable`, `Controller`, `$S`, `register`, `UserError`, `ToastService`, `Form`, `ErrorReporter`, `ConsoleReporter`, `readJson`, `changed` | everything                                                        |
| `@compean/core/react`    | `useController`, `Toaster`                                                                                                                   | web and mobile screens                                            |
| `@compean/core/server`   | `handleErrors`, `validator`, `loadConfig`                                                                                                    | the API                                                           |
| `@compean/core/testing`  | `resetServices`, `RecordingReporter`, `recordingNavigation`                                                                                  | tests                                                             |
| `@compean/core/eslint`   | `compeanRules`                                                                                                                               | each app's `eslint.config.js`                                     |
| `@compean/core/prettier` | the shared Prettier config (4 spaces, width 130, single quotes)                                                                              | each app's `package.json`: `"prettier": "@compean/core/prettier"` |

## A screen in four pieces

```ts
// packages/client: the controller
export class NotesController extends Controller<NotesState> {
    private notes: Note[] = [];
    public readonly form = new Form(AddNoteSchema, { body: '' });

    public initialize(): void {
        this.track(this.form.subscribe(() => this.notify()));
        void this.load(async () => {
            this.notes = await $S(NotesService).list();
        });
    }

    public get state(): NotesState {
        return { status: this.status, loadError: this.loadError, notes: this.notes, form: this.form.view() };
    }

    public addNote(): Promise<void> {
        return this.run(() =>
            this.form.submit(async (input) => {
                await $S(NotesService).add(input);
                this.form.reset();
                $S(ToastService).show('Note added');
            }),
        );
    }
}
```

```tsx
// apps/web: the screen
const { state, controller } = useController(() => new NotesController());
```

```ts
// apps/api: errors become HTTP in one place
app.onError(handleErrors());
```

```ts
// eslint.config.js
export default [...typescriptConfig, ...compeanRules()];
```

## Design notes

Decisions that span several modules, with the alternatives that were rejected. Code comments point here instead of repeating them.

### Controller status: `load()` and `run()`

A screen is `'loading'`, `'ready'` or `'error'`. Only `load()` decides that status, and only until the screen is first ready. Several first loads are allowed: the status settles when they have all finished, as `'error'` with the first failure's message if any failed; after that a load is a refresh, so its failure shows as a toast and the data stays on screen. `run()` never touches the status. `start()` (called by `useController`) marks a screen that started no load as ready.

- Rejected: one `run()` for everything, where the first run counted as the load. A form screen with nothing to load stayed `'loading'`, and its first failed submit replaced the whole screen with an error.
- Rejected: `run(task, { load: true })`. A flag that changes behaviour is a special case every caller has to remember.

### One `UserError` class

Everything the user should read is a `UserError(message, status)`; everything else is a bug that is reported and shown generically. `readJson` rebuilds the same class on the client from a 4xx `{ message }`, so `load()`, `run()` and `handleErrors` share one rule.

- Rejected: a subclass per status (`NotFoundError`, `ConflictError`). The client only asks "may I show this?", which the class answers; the status carries the rest.

### Reporting never breaks error handling

`load()`, `run()` and `handleErrors` report through one internal `reportSafely`, which falls back to the console when the registered reporter throws. A vendor outage must never turn a handled error into an unhandled one.

### Defaults in the registry

`$S(ToastService)` and `$S(ErrorReporter)` work without wiring (a fresh `ToastService`, a `ConsoleReporter`), so tests and local runs need no boot code. Every other service must be registered; a missing one is a wiring bug and throws.

### `useController` and React StrictMode

StrictMode runs an effect, disposes, then runs it again on the same controller. The hook never starts a disposed controller; it mounts a fresh one. On a key change it creates the new controller during render, so the screen never shows the new controller with the old one's state.

- Rejected: `useSyncExternalStore` on `controller.state`. The getter builds a new object on every read, which makes React re-render forever.

### Lint rules are core's own

The four checks are small ESLint rules shipped by core, not stacked `no-restricted-imports` entries. ESLint lets a later config entry for the same rule replace an earlier one, so overlapping file globs would silently cancel each other.
