import { ExecutionContextService, MethodContextService, getAveragePrice, lib } from "backtest-kit";

import NodeType from '../enum/NodeType';
import { TypedNode, SourceNode, OutputNode } from '../interfaces/TypedNode.interface';
import { Value } from '../interfaces/Node.interface';

/**
 * Проверяет граф на циклы (DFS с раскраской: path — серые, done — чёрные).
 * Линейная сложность за счёт done-набора; общие зависимости (ромбы) не
 * обходятся повторно. Циклы возможны только у графов, собранных вручную
 * или восстановленных через deserialize — хелперы sourceNode/outputNode
 * создать цикл не позволяют.
 */
const CHECK_CYCLES_FN = (root: TypedNode): void => {
    const path = new Set<TypedNode>();
    const done = new Set<TypedNode>();
    const walk = (node: TypedNode): void => {
        if (done.has(node)) {
            return;
        }
        if (path.has(node)) {
            throw new Error("graph resolve: cycle detected in node graph");
        }
        path.add(node);
        if (node.type === NodeType.OutputNode) {
            (node.nodes ?? []).forEach(walk);
        }
        path.delete(node);
        done.add(node);
    };
    walk(root);
};

/**
 * Рекурсивно вычисляет значение узла графа.
 * Для SourceNode вызывает fetch().
 * Для OutputNode сначала резолвит все дочерние nodes параллельно,
 * затем передаёт их типизированные значения в compute().
 *
 * Гарантии одного прохода:
 * - каждый узел вычисляется ровно один раз (мемоизация по ссылке):
 *   общая зависимость в «ромбе» даёт один fetch и одно согласованное
 *   значение для всех потребителей;
 * - currentPrice запрашивается один раз и передаётся всем SourceNode;
 * - цикл в графе даёт понятную ошибку, а не переполнение стека.
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

    CHECK_CYCLES_FN(node);

    const { symbol, when } = lib.executionContextService.context;
    const { exchangeName } = lib.methodContextService.context;

    // Одна цена на весь проход: без повторных запросов на каждый SourceNode
    // и без рассинхрона значений между источниками одного вычисления.
    let currentPricePromise: Promise<number> | null = null;
    const GET_PRICE_FN = () => {
        if (!currentPricePromise) {
            currentPricePromise = getAveragePrice(symbol);
        }
        return currentPricePromise;
    };

    const memo = new Map<TypedNode, Promise<Value>>();

    const resolveNode = (target: TypedNode): Promise<Value> => {
        const cached = memo.get(target);
        if (cached) {
            return cached;
        }
        const promise = (async (): Promise<Value> => {
            if (target.type === NodeType.SourceNode) {
                const currentPrice = await GET_PRICE_FN();
                return await target.fetch(symbol, when, currentPrice, exchangeName);
            }
            const values = await Promise.all((target.nodes ?? []).map(resolveNode));
            return await target.compute(values as any);
        })();
        memo.set(target, promise);
        return promise;
    };

    return await resolveNode(node);
};

export default resolve;
