import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Controller } from '../controller.js';
import { $S } from '../registry.js';
import { ToastService, type Toast } from '../toast.service.js';

type StateOf<C> = C extends Controller<infer S> ? S : never;

interface Mounted<C> {
    controller: C;
    key: string | undefined;
    state: StateOf<C>;
}

const disposed = new WeakSet<Controller<unknown>>();

function mount<C extends Controller<unknown>>(create: () => C, key: string | undefined): Mounted<C> {
    const controller = create();
    return { controller, key, state: controller.state as StateOf<C> };
}

/**
 * Creates a screen's controller, initializes it, re-renders on every `notify()` and disposes it on
 * unmount. A new `key` (such as a route param) replaces the controller. A controller is never
 * initialized again after it was disposed, so React StrictMode gets a fresh one instead.
 */
export function useController<C extends Controller<unknown>>(
    create: () => C,
    key?: string,
): { state: StateOf<C>; controller: C } {
    const createRef = useRef(create);
    createRef.current = create;
    const [mounted, setMounted] = useState(() => mount(create, key));

    let current = mounted;
    if (mounted.key !== key) {
        current = mount(create, key);
        setMounted(current);
    }
    const { controller } = current;

    useEffect(() => {
        if (disposed.has(controller)) {
            setMounted((previous) => (previous.controller === controller ? mount(createRef.current, previous.key) : previous));
            return;
        }
        const refresh = () =>
            setMounted((previous) =>
                previous.controller === controller ? { ...previous, state: controller.state as StateOf<C> } : previous,
            );
        const unsubscribe = controller.subscribe(refresh);
        refresh();
        controller.initialize();
        return () => {
            unsubscribe();
            disposed.add(controller);
            controller.dispose();
        };
    }, [controller]);

    return { state: current.state, controller };
}

/**
 * Shows the latest toast from ToastService, rendered by the app's own `children`, and hides it
 * after `duration` milliseconds. Mount it once at the app root.
 */
export function Toaster({ children, duration = 4000 }: { children: (toast: Toast) => ReactNode; duration?: number }): ReactNode {
    const toasts = $S(ToastService);
    const subscribe = useCallback((onChange: () => void) => toasts.subscribe(onChange), [toasts]);
    const toast = useSyncExternalStore(subscribe, () => toasts.latest());

    useEffect(() => {
        if (!toast) {
            return;
        }
        const timer = setTimeout(() => toasts.dismiss(toast.id), duration);
        return () => clearTimeout(timer);
    }, [toast, toasts, duration]);

    return toast ? children(toast) : null;
}
