import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Controller } from '../controller.js';
import { $S } from '../registry.js';
import { ToastService, type Toast } from '../toast.service.js';

type StateOf<C> = C extends Controller<infer S> ? S : never;

/**
 * Creates a screen's controller once, initializes it, re-renders on every `notify()` and disposes
 * it on unmount. A new `key` (such as a route param) replaces the controller.
 */
export function useController<C extends Controller<unknown>>(
    create: () => C,
    key?: string,
): { state: StateOf<C>; controller: C } {
    const controllerRef = useRef<C | null>(null);
    const keyRef = useRef(key);

    if (controllerRef.current && keyRef.current !== key) {
        controllerRef.current = null;
        keyRef.current = key;
    }
    if (!controllerRef.current) {
        controllerRef.current = create();
    }
    const controller = controllerRef.current;
    const [state, setState] = useState(() => controller.state as StateOf<C>);

    useEffect(() => {
        setState(controller.state as StateOf<C>);
        const unsubscribe = controller.subscribe(() => setState(controller.state as StateOf<C>));
        controller.initialize();
        return () => {
            unsubscribe();
            controller.dispose();
        };
    }, [controller]);

    return { state, controller };
}

/**
 * Shows the latest toast from ToastService, rendered by the app's own `children`, and hides it
 * after `duration` milliseconds. Mount it once at the app root.
 */
export function Toaster({ children, duration = 4000 }: { children: (toast: Toast) => ReactNode; duration?: number }): ReactNode {
    const toasts = $S(ToastService);
    const toast = useSyncExternalStore(
        (onChange) => toasts.subscribe(onChange),
        () => toasts.latest(),
    );

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => toasts.dismiss(toast.id), duration);
        return () => clearTimeout(timer);
    }, [toast, toasts, duration]);

    return toast ? children(toast) : null;
}
