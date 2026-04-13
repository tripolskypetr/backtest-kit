import { useState, useMemo } from 'react';
import { FileNode } from '../model/fileTree';

/* ─── pure helpers (no React) ───────────────────────────────────────────── */

function matches(node: FileNode, q: string): boolean {
  if (!q) return true;
  if (node.name.toLowerCase().includes(q.toLowerCase())) return true;
  return node.children?.some((c) => matches(c, q)) ?? false;
}

export function filterTree(nodes: FileNode[], q: string): FileNode[] {
  return nodes.reduce<FileNode[]>((acc, node) => {
    if (!matches(node, q)) return acc;
    if (node.folder) {
      acc.push({ ...node, children: filterTree(node.children ?? [], q) });
    } else {
      acc.push(node);
    }
    return acc;
  }, []);
}

export function collectFolderIds(nodes: FileNode[]): string[] {
  return nodes.flatMap((n) =>
    n.folder ? [n.id, ...collectFolderIds(n.children ?? [])] : [],
  );
}

export function countFiles(nodes: FileNode[]): number {
  return nodes.reduce(
    (acc, n) => acc + (n.folder ? countFiles(n.children ?? []) : 1),
    0,
  );
}

/* ─── hook ──────────────────────────────────────────────────────────────── */

export interface UseFileSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  expanded: string[];
  setExpanded: (ids: string[]) => void;
  filtered: FileNode[];
  totalFiles: number;
  visibleFiles: number;
}

export function useFileSearch(
  tree: FileNode[],
  initialExpanded: string[] = [],
  externalQuery?: string,
): UseFileSearchReturn {
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
