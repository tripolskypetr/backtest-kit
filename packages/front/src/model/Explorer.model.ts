export interface ExplorerFile {
  id: string;
  path: string;
  label: string;
  type: "file";
  mimeType: string;
}

export interface ExplorerFileMock extends ExplorerFile {
  content: string;
}

export interface ExplorerDirectory {
  id: string;
  path: string;
  label: string;
  type: "directory";
  nodes: ExplorerNode[];
}

export type ExplorerNode = ExplorerFile | ExplorerDirectory;
