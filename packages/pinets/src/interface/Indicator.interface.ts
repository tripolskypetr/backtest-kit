export type TIndicatorCtor = (source: string, inputs?: Record<string, any>) => IIndicator; 

export interface IIndicator {
    source: string;
    inputs: Record<string, any>;
}
