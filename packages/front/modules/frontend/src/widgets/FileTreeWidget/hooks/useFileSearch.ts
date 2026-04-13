import { useState, useMemo } from 'react';
import { IFileNode } from '../model/IFileNode.model';

function matches(node: IFileNode, q: string): boolean {
    if (!q) return true;
    if (node.name.toLowerCase().includes(q.toLowerCase())) return true;
    return node.children?.some((c) => matches(c, q)) ?? false;
}

export function filterTree(nodes: IFileNode[], q: string): IFileNode[] {
    return nodes.reduce<IFileNode[]>((acc, node) => {
        if (!matches(node, q)) return acc;
        if (node.folder) {
            acc.push({ ...node, children: filterTree(node.children ?? [], q) });
        } else {
            acc.push(node);
        }
        return acc;
    }, []);
}

export function collectFolderIds(nodes: IFileNode[]): string[] {
    return nodes.flatMap((n) =>
        n.folder ? [n.id, ...collectFolderIds(n.children ?? [])] : [],
    );
}

export function countFiles(nodes: IFileNode[]): number {
    return nodes.reduce(
        (acc, n) => acc + (n.folder ? countFiles(n.children ?? []) : 1),
        0,
    );
}

export interface IUseFileSearchReturn {
    query: string;
    setQuery: (q: string) => void;
    selected: string | null;
    setSelected: (id: string | null) => void;
    expanded: string[];
    setExpanded: (ids: string[]) => void;
    filtered: IFileNode[];
    totalFiles: number;
    visibleFiles: number;
}

export function useFileSearch(
    tree: IFileNode[],
    initialExpanded: string[] = [],
    externalQuery?: string,
): IUseFileSearchReturn {
    const [internalQuery, setInternalQuery] = useState(externalQuery ?? '');
    const query = externalQuery !== undefined ? externalQuery : internalQuery;
    const setQuery = externalQuery !== undefined ? () => {} : setInternalQuery;
    const [selected, setSelected] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string[]>(initialExpanded);

    const filtered = useMemo(
        () => (query ? filterTree(tree, query) : tree),
        [query, tree],
    );

    const expandedIds = useMemo(
        () => (query ? collectFolderIds(filtered) : expanded),
        [query, filtered, expanded],
    );

    const totalFiles = useMemo(() => countFiles(tree), [tree]);
    const visibleFiles = useMemo(() => countFiles(filtered), [filtered]);

    return {
        query,
        setQuery,
        selected,
        setSelected,
        expanded: expandedIds,
        setExpanded,
        filtered,
        totalFiles,
        visibleFiles,
    };
}
