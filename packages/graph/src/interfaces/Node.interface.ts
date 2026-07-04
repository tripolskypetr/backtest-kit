import NodeType from '../enum/NodeType';
import { ExchangeName } from '../model/ExchangeName.model';

/**
 * Любое возможное вычисленное значение узла графа.
 */
export type Value = string | number | boolean | object | null;

/**
 * Плоский базовый интерфейс узла графа.
 * Следует тому же паттерну, что IField в react-declarative:
 * все свойства опциональны, type — обязателен.
 */
export interface INode {

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

export default INode;

/**
 * Внутренний тип: узел с гарантированно проставленным идентификатором.
 * В таком виде узлы существуют после входа в пайплайн (хелперы
 * sourceNode/outputNode, serialize, deserialize).
 */
export interface INodeInternal extends INode {
    id: string;
};
