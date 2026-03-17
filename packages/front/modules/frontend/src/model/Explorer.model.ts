export interface ExplorerFile {
  path: string;
  label: string;
  type: "file";
  mimeType: string;
}

export interface ExplorerDirectory {
  path: string;
  label: string;
  type: "directory";
  nodes: ExplorerNode[];
}

export type ExplorerRecord = {
  [path: string]: ExplorerFile | ExplorerRecord;
};

export type ExplorerNode = ExplorerFile | ExplorerDirectory;
