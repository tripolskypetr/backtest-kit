import { IField, FieldType, getAvailableFields, inject } from "react-declarative";
import { get } from "lodash";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import downloadMarkdown from "../../../utils/downloadMarkdown";

export class MarkdownHelperService {

    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    public buildMarkdownFromFields = <Data extends object = any>(
        fields: IField[],
        data: Data,
        payload: Record<string, any> = {},
    ): string => {
        this.loggerService.log("markdownHelperService buildMarkdownFromFields", {
            fields,
            data,
        });

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

    public printFields = async <Data extends object = any>(
        fields: IField[],
        data: Data,
        payload: Record<string, any> = {},
    ) => {
        this.loggerService.log("markdownHelperService printFields", {
            fields,
            data,
        });
        const content = this.buildMarkdownFromFields(fields, data, payload);
        await downloadMarkdown(content);
    }
}

export default MarkdownHelperService;
