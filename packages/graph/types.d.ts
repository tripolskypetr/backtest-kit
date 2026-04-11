declare enum NodeType {
    SourceNode = "source_node",
    OutputNode = "output_node"
}

type ExchangeName = string;

/**
 * Любое возможное вычисленное значение узла графа.
 */
type Value = string | number | boolean | object | null;
/**
 * Плоский базовый интерфейс узла графа.
 * Следует тому же паттерну, что IField в react-declarative:
 * все свойства опциональны, type — обязателен.
 */
interface INode {
    /**
     * Тип узла для логического ветвления при исполнении графа
     */
    type: NodeType;
    /**
     * Человеко-читаемое описание узла, не влияет на исполнение графа.
     */
    description?: string;
    /**
     * Источник данных для SourceNode.
     * Вызывается при вычислении узла без входящих зависимостей.
     */
    fetch?: (symbol: string, when: Date, currentPrice: number, exchangeName: ExchangeName) => Promise<Value> | Value;
    /**
     * Функция вычисления для OutputNode.
     * Получает на вход массив значений, возвращённых fetch/compute
     * из узлов массива nodes, в том же порядке.
     */
    compute?: (values: Value[]) => Promise<Value> | Value;
    /**
     * Входящие зависимости для OutputNode.
     * Значения этих узлов передаются в compute.
     */
    nodes?: INode[];
}

/**
 * Маппинг tuple нод в tuple их resolved-значений.
 * Сохраняет позиционную структуру: [SourceNode<number>, SourceNode<string>] → [number, string].
 */
type InferValues<TNodes extends TypedNode[]> = {
    [K in keyof TNodes]: TNodes[K] extends TypedNode ? InferNodeValue<TNodes[K]> : never;
};
/**
 * Извлекает тип возвращаемого значения из TypedNode.
 * Используется InferValues и run() для типобезопасного резолвинга.
 */
type InferNodeValue<T extends TypedNode> = T extends SourceNode<infer V> ? V : T extends OutputNode<any, infer V> ? V : never;
/**
 * Узел-источник данных. Не имеет входящих зависимостей.
 * T — тип значения, возвращаемого fetch().
 */
type SourceNode<T extends Value = Value> = {
    type: NodeType.SourceNode;
    description?: string;
    fetch: (symbol: string, when: Date, currentPrice: number, exchangeName: ExchangeName) => Promise<T> | T;
};
/**
 * Узел вычисления. TNodes — tuple входящих зависимостей,
 * TResult — тип возвращаемого значения compute().
 * values в compute автоматически выводится из типов TNodes.
 */
type OutputNode<TNodes extends TypedNode[] = TypedNode[], TResult extends Value = Value> = {
    type: NodeType.OutputNode;
    description?: string;
    nodes: TNodes;
    compute: (values: InferValues<TNodes>) => Promise<TResult> | TResult;
};
/**
 * Типизированный узел графа для прикладного программиста.
 * Подставляется вместо INode для строгой проверки типов и IntelliSense.
 */
type TypedNode = SourceNode<Value> | OutputNode<TypedNode[], Value>;

declare const sourceNode: <T extends Value>(fetch: (symbol: string, when: Date, currentPrice: number, exchangeName: ExchangeName) => Promise<T> | T) => SourceNode<T>;
declare const outputNode: <TNodes extends TypedNode[], TResult extends Value = Value>(compute: (values: InferValues<TNodes>) => Promise<TResult> | TResult, ...nodes: TNodes) => OutputNode<TNodes, TResult>;

/**
 * Рекурсивно разворачивает граф узлов в плоский массив.
 * Порядок: сначала зависимости (children), затем родитель — топологический порядок.
 * Дубликаты (один узел может быть зависимостью нескольких) исключаются по ссылке.
 */
declare const deepFlat: (arr?: INode[]) => INode[];

/**
 * Рекурсивно вычисляет значение узла графа.
 * Для SourceNode вызывает fetch().
 * Для OutputNode сначала резолвит все дочерние nodes параллельно,
 * затем передаёт их типизированные значения в compute().
 */
declare function resolve<V extends Value>(node: SourceNode<V>): Promise<V>;
declare function resolve<TNodes extends TypedNode[], V extends Value>(node: OutputNode<TNodes, V>): Promise<V>;

/**
 * Сериализованная (плоская) форма узла графа для хранения в БД.
 * Объектные ссылки nodes заменены на массив идентификаторов nodeIds.
 */
interface IFlatNode {
    /**
     * Уникальный идентификатор узла.
     */
    id: string;
    /**
     * Тип узла.
     */
    type: NodeType;
    /**
     * Человеко-читаемое описание узла.
     */
    description?: string;
    /**
     * Идентификаторы входящих зависимостей.
     * Порядок соответствует порядку значений в compute(values).
     */
    nodeIds?: string[];
    /**
     * Источник данных для SourceNode — не сериализуется в БД,
     * восстанавливается на стороне приложения.
     */
    fetch?: (symbol: string, when: Date, currentPrice: number, exchangeName: ExchangeName) => Promise<Value> | Value;
    /**
     * Функция вычисления для OutputNode — не сериализуется в БД,
     * восстанавливается на стороне приложения.
     */
    compute?: (values: Value[]) => Promise<Value> | Value;
}

/**
 * Преобразует древовидный граф в плоский массив IFlatNode для хранения в БД.
 * Каждому узлу присваивается уникальный id (если не задан),
 * объектные ссылки nodes заменяются на массив nodeIds.
 */
declare const serialize: (roots: INode[]) => IFlatNode[];
/**
 * Восстанавливает древовидный граф из плоского массива IFlatNode.
 * nodes каждого узла заполняется по nodeIds.
 * Возвращает корневые узлы (те, на которые никто не ссылается).
 */
declare const deserialize: (flat: IFlatNode[]) => INode[];

export { type IFlatNode, type INode, type TypedNode, type Value, deepFlat, deserialize, outputNode, resolve, serialize, sourceNode };
