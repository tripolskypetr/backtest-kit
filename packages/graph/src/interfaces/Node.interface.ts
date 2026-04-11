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
