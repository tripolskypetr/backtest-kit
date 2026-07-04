import { randomString } from "functools-kit";

import INode, { INodeInternal } from '../interfaces/Node.interface';
import IFlatNode from '../interfaces/FlatNode.interface';

import deepFlat from './deepFlat';

/**
 * Нормализация на входе пайплайна: гарантирует каждому узлу идентификатор.
 * Узлы из sourceNode/outputNode приходят уже с id; рукописным INode id
 * доштамповывается прямо на объект — повторный serialize того же графа
 * даёт те же идентификаторы.
 */
const ENSURE_ID_FN = (node: INode): INodeInternal => {
    if (!node.id) {
        node.id = randomString();
    }
    return node as INodeInternal;
};

/**
 * Преобразует древовидный граф в плоский массив IFlatNode для хранения в БД.
 * Объектные ссылки nodes заменяются на массив nodeIds.
 *
 * Задавайте узлам стабильные id, если планируете восстанавливать fetch/compute
 * после JSON-сериализации: функции в JSON не переживают round-trip, и найти
 * узел для повторной привязки можно только по известному id (случайный id
 * не переживает перезапуск процесса).
 */
export const serialize = (roots: INode[]): IFlatNode[] => {
    // Вход пайплайна: все узлы получают гарантированный id
    const flat = deepFlat(roots).map(ENSURE_ID_FN);

    const usedIds = new Set<string>();
    flat.forEach((node) => {
        if (usedIds.has(node.id)) {
            throw new Error(`graph serialize: duplicate node id "${node.id}"`);
        }
        usedIds.add(node.id);
    });

    return flat.map((node) => {
        const flatNode: IFlatNode = {
            id: node.id,
            type: node.type,
            description: node.description,
            fetch: node.fetch,
            compute: node.compute,
            nodeIds: node.nodes?.map((child) => ENSURE_ID_FN(child).id),
        };
        return flatNode;
    });
};

/**
 * Восстанавливает древовидный граф из плоского массива IFlatNode.
 * nodes каждого узла заполняется по nodeIds; id сохраняется на узле,
 * так что повторный serialize даёт те же идентификаторы.
 * Ссылка на неизвестный nodeId — ошибка: contract compute(values)
 * позиционный, тихое выпадение элемента сдвинуло бы чужие значения.
 * Возвращает корневые узлы (те, на которые никто не ссылается).
 */
export const deserialize = (flat: IFlatNode[]): INodeInternal[] => {
    // Первый проход: создаём узлы, индексируем по id
    const byId = new Map<string, INodeInternal>();
    flat.forEach((flatNode) => {
        const node: INodeInternal = {
            id: flatNode.id,
            type: flatNode.type,
            description: flatNode.description,
            fetch: flatNode.fetch,
            compute: flatNode.compute,
        };
        byId.set(flatNode.id, node);
    });

    // Второй проход: проставляем nodes[] по nodeIds (включая пустой массив —
    // OutputNode без зависимостей легален и должен получить nodes: [])
    flat.forEach((flatNode) => {
        if (flatNode.nodeIds) {
            const node = byId.get(flatNode.id)!;
            node.nodes = flatNode.nodeIds.map((id) => {
                const child = byId.get(id);
                if (!child) {
                    throw new Error(
                        `graph deserialize: node "${flatNode.id}" references unknown nodeId "${id}"`,
                    );
                }
                return child;
            });
        }
    });

    // Корневые узлы — те, на которые не ссылается никто другой
    const referenced = new Set(flat.flatMap((n) => n.nodeIds ?? []));
    return [...byId.entries()]
        .filter(([id]) => !referenced.has(id))
        .map(([, node]) => node);
};
