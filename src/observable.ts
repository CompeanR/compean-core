/** Something screens can watch: subscribers are called after every change. */
export abstract class Observable {
    private readonly listeners = new Set<() => void>();

    /** Calls `listener` after each change until the returned function is called. */
    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    protected notify(): void {
        for (const listener of [...this.listeners]) {
            listener();
        }
    }
}
