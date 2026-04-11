import { ExecutionContextService, MethodContextService, getAveragePrice, lib } from "backtest-kit";

import NodeType from '../enum/NodeType';
import { TypedNode, SourceNode, OutputNode } from '../interfaces/TypedNode.interface';
import { Value } from '../interfaces/Node.interface';

/**
 * Рекурсивно вычисляет значение узла графа.
 * Для SourceNode вызывает fetch().
 * Для OutputNode сначала резолвит все дочерние nodes параллельно,
 * затем передаёт их типизированные значения в compute().
 */
export async function resolve<V extends Value>(node: SourceNode<V>): Promise<V>;
export async function resolve<TNodes extends TypedNode[], V extends Value>(node: OutputNode<TNodes, V>): Promise<V>;
export async function resolve(node: TypedNode): Promise<Value> {

    if (!ExecutionContextService.hasContext()) {
        throw new Error("Execution context is required to resolve graph nodes. Please ensure that resolve() is called within a valid execution context.");
    }

    if (!MethodContextService.hasContext()) {
        throw new Error("Method context is required to resolve graph nodes. Please ensure that resolve() is called within a valid method context.");
    }

    if (node.type === NodeType.SourceNode) {
        const { symbol, when } = lib.executionContextService.context;
        const { exchangeName } = lib.methodContextService.context;
        const currentPrice = await getAveragePrice(symbol)
        return await node.fetch(symbol, when, currentPrice, exchangeName);
    }
    const values = await Promise.all(node.nodes.map(resolve));
    return await node.compute(values as any);
};

export default resolve;
