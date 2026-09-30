import { EntitySchema } from "typeorm";
import { DictionaryData } from "tradeforge";
import { epochTransformer } from "../utils/epochTransformer";

interface IDictionaryDto {
  signalId: string;
  dictionaryName: string;
  payload: DictionaryData;
  when: number;
}

interface IDictionaryRow extends IDictionaryDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const DictionaryModel = new EntitySchema<IDictionaryRow>({
  name: "dictionary-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    signalId: { type: String },
    dictionaryName: { type: String },
    payload: { type: "jsonb" },
    when: { type: "bigint", transformer: epochTransformer },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "dictionary_items_uq",
      columns: ["signalId", "dictionaryName"],
      unique: true,
    },
  ],
});

export { DictionaryModel, IDictionaryDto, IDictionaryRow };
