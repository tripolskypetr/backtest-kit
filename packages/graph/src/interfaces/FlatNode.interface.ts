import { Value } from './Node.interface';
import NodeType from '../enum/NodeType';
import { ExchangeName } from '../model/ExchangeName.model';

/**
 * Сериализованная (плоская) форма узла графа для хранения в БД.
 * Объектные ссылки nodes заменены на массив идентификаторов nodeIds.
 */
export interface IFlatNode {

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

export default IFlatNode;
