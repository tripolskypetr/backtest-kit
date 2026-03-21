const join = <T = string>(...arr: (T | T[] | null)[] | (T | T[] | null)[][]): T[] => {
    arr = arr.flat(1) as typeof arr;
    return arr.flatMap((item) => {
        if (Array.isArray(item)) {
            return join(item as T[]);
        }
        return item;
    }).filter(Boolean) as T[];
};

/**
 * Joins an array of strings or arrays of strings into a single string, with each element separated by a space.
 * It also handles cases where the input is null or nested arrays.
 */
export const str = (...arr: (number | string | string[] | null)[] | (number | string | string[] | null)[][]): string => {
    return join(...arr).join(" ");
};

/**
 * Joins an array of strings or arrays of strings into a single string, with each element separated by a newline.
 */
str.newline = (...arr: (number | string | string[] | null)[] | (number | string | string[] | null)[][]): string => {
    return join(...arr).join("\n");
};

/**
 * Joins an array of strings or arrays of strings into a single string, with each element separated by a space.
 */
str.space = (...arr: (number | string | string[] | null)[] | (number | string | string[] | null)[][]): string => {
    return join(...arr).join(" ");
};

/**
 * Joins an array of strings or arrays of strings into a single string, with each element separated by a comma.
 */
str.comma = (...arr: (number | string | string[] | null)[] | (number | string | string[] | null)[][]): string => {
    return join(...arr).join(", ");
};

/**
 * Joins an array of strings or arrays of strings into a single string, with each element separated by a period.
 */
str.dot = (...arr: (number | string | string[] | null)[] | (number | string | string[] | null)[][]): string => {
    return join(...arr).join(". ");
};

/**
 * Joins an array of strings or arrays of strings into a single string, with each element separated by a semicolon.
 */
str.semicolon =  (...arr: (number | string | string[] | null)[] | (number | string | string[] | null)[][]): string => {
    return join(...arr).join(";");
};

/**
 * Joins an array of strings or arrays of strings into a markdown table row format.
 * Each element is separated by a pipe character and spaces.
 * For example, inputting ["Name", "Age", "Location"] would return "| Name | Age | Location |".
 */
str.table = (...arr: (number | string | string[] | null)[] | (number | string | string[] | null)[][]): string => {
    return `| ${join(...arr).join(" | ")} |`;
};

export default str;
