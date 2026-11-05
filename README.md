# @compean/core

The shared core of every Compean app: controllers, services, errors, forms, feedback messages and bug reporting, plus the ESLint rules that keep apps consistent. React web (Vite + TanStack Router), React Native (Expo) and a Hono API on Node all build on it.

**Read [`RULES.md`](RULES.md) before writing code in an app that uses this package.** It holds the conventions; this README only lists what the package exports.

## Install

```sh
pnpm add @compean/core zod
```

Optional peers, by entry point: `react` for `/react`; `hono` and `@hono/zod-validator` for `/server`; `@tanstack/query-core` for `changed()`; `eslint` for `/eslint`. Requires Node 22.12 or later.

Bug reports from `run()` name the controller by its class name, so production builds must keep class names: in Vite, set `esbuild: { keepNames: true }`.

## Entry points

| Import | Exports | Used in |
|---|---|---|
| `@compean/core` | `Observable`, `Controller`, `$S`, `register`, `UserError`, `ToastService`, `Form`, `ErrorReporter`, `ConsoleReporter`, `readJson`, `changed` | everything |
| `@compean/core/react` | `useController`, `Toaster` | web and mobile screens |
| `@compean/core/server` | `handleErrors`, `validator`, `loadConfig` | the API |
| `@compean/core/testing` | `resetServices`, `RecordingReporter`, `recordingNavigation` | tests |
| `@compean/core/eslint` | `compeanRules` | each app's `eslint.config.js` |

## A screen in four pieces

```ts
// packages/client: the controller
export class NotesController extends Controller<NotesState> {
    public readonly form = new Form(AddNoteSchema, { body: '' });

    public initialize(): void {
        this.track(this.form.subscribe(() => this.notify()));
        void this.run(() => this.load());
    }

    public get state(): NotesState {
        return { status: this.status, notes: this.notes, form: this.form.view() };
    }

    public addNote(): Promise<void> {
        return this.run(() => this.form.submit(async (input) => {
            await $S(NotesService).add(input);
            this.form.reset();
            $S(ToastService).show('Note added');
        }));
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
