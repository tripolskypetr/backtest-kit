export type ModuleExports = {
    [key: string]: any;
    default?: any;
}

export interface ModuleModel {
    exports: ModuleExports
}
