import { IField, FieldType, getAvailableFields } from "react-declarative";
import { get } from "lodash";

export class MarkdownHelperService {
    buildMarkdownFromFields = <Data extends object = any>(
        fields: IField[],
        data: Data,
        payload: Record<string, any> = {},
    ): string => {
        const lines: string[] = [];

        const { visible } = getAvailableFields(
            fields,
            data,
            payload,
            payload.permissions,
        );

        const visibleSet = new Set(visible);

        const walk = (field: IField) => {
            if (!visibleSet.has(field)) {
                return;
            }

            if (field.type === FieldType.Typography) {
                if (field.placeholder) {
                    lines.push(`\n## ${field.placeholder}\n`);
                }
                return;
            }

            if (field.type === FieldType.Text && field.title) {
                const value = field.compute
                    ? field.compute(data, payload as any)
                    : field.name
                        ? get(data, field.name)
                        : undefined;
                if (value) {
                    lines.push(`**${field.title}:** ${String(value)}`);
                }
                return;
            }

            if (field.fields) {
                for (const child of field.fields) {
                    walk(child);
                }
            }
            if (field.child) {
                walk(field.child);
            }
        };

        for (const field of fields) {
            walk(field);
        }

        return lines.join("\n");
    };
}

export default MarkdownHelperService;
