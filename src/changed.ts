import type { QueryClient } from '@tanstack/query-core';

/** Query metadata naming the resources a cached query is built from. */
export interface DependsOnMeta<R extends string = string> {
    dependsOn?: readonly R[];
}

/**
 * Marks stale every cached query whose `meta.dependsOn` lists `resource`, so screens showing it
 * refresh. A writer calls this after a change and never needs to know who reads.
 */
export function changed<R extends string>(cache: Pick<QueryClient, 'invalidateQueries'>, resource: R): Promise<void> {
    return cache.invalidateQueries({
        predicate: (query) => (query.meta as DependsOnMeta | undefined)?.dependsOn?.includes(resource) ?? false,
    });
}
