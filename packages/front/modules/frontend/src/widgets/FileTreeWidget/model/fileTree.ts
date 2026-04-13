export interface FileNode {
  id: string;
  name: string;
  ext?: string;
  folder?: boolean;
  children?: FileNode[];
}
