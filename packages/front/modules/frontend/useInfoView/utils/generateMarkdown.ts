import { dayjs } from "react-declarative";

export interface IFormData {
  symbol?: string;
  action?: string;
  date?: string;
  price?: string;
  content?: string;
  info?: string;
}

export const generateMarkdown = (data: IFormData): string => {
  let markdown = "";

  // Properties Section
  markdown += "# Свойства\n\n";

  // Symbol
  markdown += `**Символ:** ${data.symbol || "Не указан"}\n`;

  // Price
  if (data.price) {
    markdown += `**Цена рынка:** ${data.price}\n`;
  }

  // Action
  const actionMap: { [key: string]: string } = {
    buy: "Покупка",
    wait: "Ожидание",
    close: "Продажа",
  };
  markdown += `**Тип уведомления:** ${actionMap[data.action?.toLowerCase() || ""] || "Не указан"}\n`;

  // Date
  const formattedDate = data.date ? dayjs(data.date).format("DD/MM/YYYY HH:mm") : "Не указана";
  markdown += `**Дата:** ${formattedDate}\n`;

  // Recommendation Section
  if (data.content) {
    markdown += "\n# Рекомендация\n\n";
    markdown += `${data.content}\n`;
  }

  // Reasoning Section
  if (data.info) {
    markdown += "\n# Рассуждение\n\n";
    markdown += `${data.info}\n`;
  }

  return markdown.trim();
};