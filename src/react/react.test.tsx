// @vitest-environment jsdom
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
