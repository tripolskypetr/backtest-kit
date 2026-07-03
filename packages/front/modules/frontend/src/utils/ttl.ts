import { ttl as ttlBase } from "react-declarative";

type TtlParams<A extends any[], K> = {
    key?: (args: A) => K;
    timeout?: number;
};

/**
 * ttl из react-declarative кэширует и rejected-промисы: разовый сетевой сбой
 * залипает на весь timeout (для getAveragePrice это 2.5 минуты ошибки в
 * торговой модалке без ретрая). Обёртка сбрасывает ключ при reject, чтобы
 * следующий вызов повторил запрос. Сам rejected-промис доходит до всех,
 * кто его уже ждал.
 */
export const ttl = <
    T extends (...args: A) => any,
    A extends any[],
    K = string,
>(
    run: T,
    params?: TtlParams<A, K>,
): ReturnType<typeof ttlBase<T, A, K>> => {
    const wrappedRun = ((...args: A) => {
        const result = run(...args);
        if (result instanceof Promise) {
            result.catch(() => {
                if (params?.key) {
                    wrapped.clear(params.key(args));
                } else {
                    wrapped.clear();
                }
            });
        }
        return result;
    }) as T;
    const wrapped = ttlBase(wrappedRun, params);
    return wrapped;
};

export default ttl;
