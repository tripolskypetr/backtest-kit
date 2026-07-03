import { randomString } from "functools-kit";

import NodeType from '../enum/NodeType';
import { Value } from '../interfaces/Node.interface';
import { TypedNode, SourceNode, OutputNode, InferValues } from '../interfaces/TypedNode.interface';
import { ExchangeName } from '../model/ExchangeName.model';

/**
 * Создаёт SourceNode с проставленным идентификатором.
 * Для стабильности между перезапусками процесса (JSON round-trip)
 * перезапишите id своим значением после создания.
 */
export const sourceNode = <T extends Value>(
    fetch: (symbol: string, when: Date, currentPrice: number, exchangeName: ExchangeName) => Promise<T> | T,
): SourceNode<T> => ({
    type: NodeType.SourceNode,
    id: randomString(),
    fetch,
});

/**
 * Создаёт OutputNode с проставленным идентификатором.
 * Для стабильности между перезапусками процесса (JSON round-trip)
 * перезапишите id своим значением после создания.
 */
export const outputNode = <
    TNodes extends TypedNode[],
    TResult extends Value = Value,
>(
    compute: (values: InferValues<TNodes>) => Promise<TResult> | TResult,
    ...nodes: TNodes
): OutputNode<TNodes, TResult> => ({
    type: NodeType.OutputNode,
    id: randomString(),
    nodes,
    compute,
});
