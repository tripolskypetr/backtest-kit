export interface ExplorerFile {
  id: string;
  path: string;
  label: string;
  type: "file";
  mimeType: string;
}

export interface ExplorerDirectory {
  id: string
  path: string;
  label: string;
  type: "directory";
  nodes: ExplorerNode[];
}

export type ExplorerRecord = {
  [id: string]: ExplorerRecord | string;
};

export type ExplorerMap = {
  [id: string]: ExplorerFile | ExplorerDirectory;
}

export type ExplorerData = {
  record: ExplorerRecord;
  map: ExplorerMap;
}

export type ExplorerNode = ExplorerFile | ExplorerDirectory;
