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
     * Стабильный идентификатор узла. Хелперы sourceNode/outputNode
     * проставляют его при создании; для рукописных INode он будет
     * доштампован при первом serialize. Задавайте свой id, если после
     * JSON round-trip нужно повторно привязать fetch/compute к узлам
     * (случайный id не переживает перезапуск процесса).
     */
    id?: string;
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
 * Внутренний тип: узел с гарантированно проставленным идентификатором.
 * В таком виде узлы существуют после входа в пайплайн (хелперы
 * sourceNode/outputNode, serialize, deserialize).
 */
interface INodeInternal extends INode {
    id: string;
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
    /**
     * Идентификатор узла. Хелпер sourceNode проставляет случайный id при
     * создании; перезапишите своим стабильным значением, если узел должен
     * переживать JSON round-trip (повторная привязка fetch по id).
     */
    id: string;
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
    /**
     * Идентификатор узла. Хелпер outputNode проставляет случайный id при
     * создании; перезапишите своим стабильным значением, если узел должен
     * переживать JSON round-trip (повторная привязка compute по id).
     */
    id: string;
    description?: string;
    nodes: TNodes;
    compute: (values: InferValues<TNodes>) => Promise<TResult> | TResult;
};
/**
 * Типизированный узел графа для прикладного программиста.
 * Подставляется вместо INode для строгой проверки типов и IntelliSense.
 */
type TypedNode = SourceNode<Value> | OutputNode<TypedNode[], Value>;

/**
 * Создаёт SourceNode с проставленным идентификатором.
 * Для стабильности между перезапусками процесса (JSON round-trip)
 * перезапишите id своим значением после создания.
 */
declare const sourceNode: <T extends Value>(fetch: (symbol: string, when: Date, currentPrice: number, exchangeName: ExchangeName) => Promise<T> | T) => SourceNode<T>;
/**
 * Создаёт OutputNode с проставленным идентификатором.
 * Для стабильности между перезапусками процесса (JSON round-trip)
 * перезапишите id своим значением после создания.
 */
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
 *
 * Гарантии одного прохода:
 * - каждый узел вычисляется ровно один раз (мемоизация по ссылке):
 *   общая зависимость в «ромбе» даёт один fetch и одно согласованное
 *   значение для всех потребителей;
 * - currentPrice запрашивается один раз и передаётся всем SourceNode;
 * - цикл в графе даёт понятную ошибку, а не переполнение стека.
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
 * Объектные ссылки nodes заменяются на массив nodeIds.
 *
 * Задавайте узлам стабильные id, если планируете восстанавливать fetch/compute
 * после JSON-сериализации: функции в JSON не переживают round-trip, и найти
 * узел для повторной привязки можно только по известному id (случайный id
 * не переживает перезапуск процесса).
 */
declare const serialize: (roots: INode[]) => IFlatNode[];
/**
 * Восстанавливает древовидный граф из плоского массива IFlatNode.
 * nodes каждого узла заполняется по nodeIds; id сохраняется на узле,
 * так что повторный serialize даёт те же идентификаторы.
 * Ссылка на неизвестный nodeId — ошибка: contract compute(values)
 * позиционный, тихое выпадение элемента сдвинуло бы чужие значения.
 * Возвращает корневые узлы (те, на которые никто не ссылается).
 */
declare const deserialize: (flat: IFlatNode[]) => INodeInternal[];

export { type IFlatNode, type INode, type INodeInternal, NodeType, type TypedNode, type Value, deepFlat, deserialize, outputNode, resolve, serialize, sourceNode };
