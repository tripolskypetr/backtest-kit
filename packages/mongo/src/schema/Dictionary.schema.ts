import mongoose, { Document, Schema } from "mongoose";
import { DictionaryData } from "tradeforge";

interface IDictionaryDto {
  signalId: string;
  dictionaryName: string;
  payload: DictionaryData;
  when: number;
}

interface DictionaryDocument extends IDictionaryDto, Document {}

interface IDictionaryRow extends IDictionaryDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const DictionarySchema: Schema<DictionaryDocument> = new Schema(
  {
    signalId: { type: String, required: true, index: true },
    dictionaryName: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

DictionarySchema.index({ signalId: 1, dictionaryName: 1 }, { unique: true });

const DictionaryModel = mongoose.model<DictionaryDocument>("dictionary-items", DictionarySchema);

export { DictionaryModel, IDictionaryDto, IDictionaryRow };
