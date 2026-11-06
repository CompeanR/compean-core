// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $S, Controller, register, ToastService } from '../index.js';
import { resetServices } from '../testing/index.js';
import { Toaster, useController } from './index.js';

interface CounterState {
    count: number;
}

class CounterController extends Controller<CounterState> {
    public static created = 0;
    public initialized = 0;
    public disposed = 0;
    private count = 0;

    public constructor(public readonly id: string) {
        super();
        CounterController.created += 1;
    }

    public get state(): CounterState {
        return { count: this.count };
    }

    public initialize(): void {
        this.initialized += 1;
    }

    public dispose(): void {
        this.disposed += 1;
        super.dispose();
    }

    public increment(): void {
        this.count += 1;
        this.notify();
    }
}

let latest: CounterController | null = null;

function CounterScreen({ id }: { id: string }) {
    const { state, controller } = useController(() => new CounterController(id), id);
    latest = controller;
    return <p>{`${controller.id}: ${state.count}`}</p>;
}

describe('useController', () => {
    beforeEach(() => {
        CounterController.created = 0;
        latest = null;
    });
    afterEach(cleanup);

    it('creates the controller once, initializes it, and re-renders on notify', () => {
        render(<CounterScreen id="a" />);

        act(() => latest!.increment());

        expect(screen.getByText('a: 1')).toBeTruthy();
        expect(CounterController.created).toBe(1);
        expect(latest!.initialized).toBe(1);
    });

    it('replaces the controller when the key changes and disposes the old one', () => {
        const { rerender } = render(<CounterScreen id="a" />);
        const first = latest!;

        rerender(<CounterScreen id="b" />);

        expect(screen.getByText('b: 0')).toBeTruthy();
        expect(first.disposed).toBe(1);
    });

    it('disposes the controller on unmount', () => {
        const { unmount } = render(<CounterScreen id="a" />);
        const controller = latest!;

        unmount();

        expect(controller.disposed).toBe(1);
    });
});

describe('useController, review fixes', () => {
    beforeEach(() => {
        CounterController.created = 0;
        latest = null;
    });
    afterEach(cleanup);

    it('never initializes a controller it already disposed, under StrictMode', () => {
        const controllers: CounterController[] = [];
        function Screen() {
            const { controller } = useController(() => {
                const created = new CounterController('a');
                controllers.push(created);
                return created;
            }, 'a');
            latest = controller;
            return null;
        }

        render(<StrictMode><Screen /></StrictMode>);

        for (const controller of controllers) {
            expect(controller.initialized - controller.disposed).toBeLessThanOrEqual(1);
            if (controller.disposed > 0) {
                expect(controller.initialized).toBeLessThanOrEqual(controller.disposed);
            }
        }
        expect(latest!.initialized).toBe(1);
        expect(latest!.disposed).toBe(0);
    });

    it('never renders the new controller with the old one\'s state', () => {
        const rendered: string[] = [];
        function Screen({ id }: { id: string }) {
            const { state, controller } = useController(() => new CounterController(id), id);
            latest = controller;
            rendered.push(`${controller.id}:${state.count}`);
            return null;
        }
        const { rerender } = render(<Screen id="a" />);
        act(() => latest!.increment());
        act(() => latest!.increment());

        rerender(<Screen id="b" />);

        expect(rendered).not.toContain('b:2');
    });
});

describe('Toaster', () => {
    beforeEach(() => {
        resetServices();
        register(ToastService, new ToastService());
        vi.useFakeTimers();
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('renders the latest toast with the app\'s own look, then dismisses it after its duration', () => {
        render(<Toaster duration={3000}>{(toast) => <div role="status">{`${toast.tone}: ${toast.message}`}</div>}</Toaster>);

        act(() => $S(ToastService).show('Note added'));

        expect(screen.getByRole('status').textContent).toBe('success: Note added');

        act(() => vi.advanceTimersByTime(3000));

        expect(screen.queryByRole('status')).toBeNull();
    });
});
