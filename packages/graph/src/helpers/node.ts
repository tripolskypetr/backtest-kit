import NodeType from '../enum/NodeType';
import { Value } from '../interfaces/Node.interface';
import { TypedNode, SourceNode, OutputNode, InferValues } from '../interfaces/TypedNode.interface';
import { ExchangeName } from '../model/ExchangeName.model';

export const sourceNode = <T extends Value>(
    fetch: (symbol: string, when: Date, currentPrice: number, exchangeName: ExchangeName) => Promise<T> | T,
): SourceNode<T> => ({
    type: NodeType.SourceNode,
    fetch,
});

export const outputNode = <
    TNodes extends TypedNode[],
    TResult extends Value = Value,
>(
    compute: (values: InferValues<TNodes>) => Promise<TResult> | TResult,
    ...nodes: TNodes
): OutputNode<TNodes, TResult> => ({
    type: NodeType.OutputNode,
    nodes,
    compute,
});
