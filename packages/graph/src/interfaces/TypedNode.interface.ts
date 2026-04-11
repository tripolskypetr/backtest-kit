import { Value } from './Node.interface';
import NodeType from '../enum/NodeType';
import { ExchangeName } from '../model/ExchangeName.model';

/**
 * Маппинг tuple нод в tuple их resolved-значений.
 * Сохраняет позиционную структуру: [SourceNode<number>, SourceNode<string>] → [number, string].
 */
export type InferValues<TNodes extends TypedNode[]> = {
    [K in keyof TNodes]: TNodes[K] extends TypedNode ? InferNodeValue<TNodes[K]> : never;
};

/**
 * Извлекает тип возвращаемого значения из TypedNode.
 * Используется InferValues и run() для типобезопасного резолвинга.
 */
export type InferNodeValue<T extends TypedNode> =
    T extends SourceNode<infer V> ? V :
    T extends OutputNode<any, infer V> ? V :
    never;

/**
 * Узел-источник данных. Не имеет входящих зависимостей.
 * T — тип значения, возвращаемого fetch().
 */
export type SourceNode<T extends Value = Value> = {
    type: NodeType.SourceNode;
    description?: string;
    fetch: (symbol: string, when: Date, currentPrice: number, exchangeName: ExchangeName) => Promise<T> | T;
};

/**
 * Узел вычисления. TNodes — tuple входящих зависимостей,
 * TResult — тип возвращаемого значения compute().
 * values в compute автоматически выводится из типов TNodes.
 */
export type OutputNode<
    TNodes extends TypedNode[] = TypedNode[],
    TResult extends Value = Value,
> = {
    type: NodeType.OutputNode;
    description?: string;
    nodes: TNodes;
    compute: (values: InferValues<TNodes>) => Promise<TResult> | TResult;
};

/**
 * Discriminated union — type-guard для TypeScript.
 * Аналог TypedFieldRegistry из react-declarative.
 */
export type TypedNodeRegistry<Target = unknown> =
    Target extends SourceNode<infer V> ? SourceNode<V> :
    Target extends OutputNode<infer N, infer V> ? OutputNode<N, V> :
    never;

/**
 * Типизированный узел графа для прикладного программиста.
 * Подставляется вместо INode для строгой проверки типов и IntelliSense.
 */
export type TypedNode = SourceNode<Value> | OutputNode<TypedNode[], Value>;

export default TypedNode;
