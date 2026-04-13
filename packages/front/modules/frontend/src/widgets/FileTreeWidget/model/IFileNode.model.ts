export interface IFileNode {
    id: string;
    name: string;
    ext?: string;
    folder?: boolean;
    children?: IFileNode[];
}
