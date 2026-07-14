import mongoose, { Document, Schema } from "mongoose";
import { MemoryData } from "backtest-kit";

interface IMemoryDto {
  signalId: string;
  bucketName: string;
  memoryId: string;
  payload: MemoryData;
  removed: boolean;
  when: number;
}

interface MemoryDocument extends IMemoryDto, Document {}

interface IMemoryRow extends IMemoryDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const MemorySchema: Schema<MemoryDocument> = new Schema(
  {
    signalId: { type: String, required: true, index: true },
    bucketName: { type: String, required: true, index: true },
    memoryId: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    removed: { type: Boolean, required: true, default: false, index: true },
    when: { type: Number, required: true, index: true },
  },
  { timestamps: { createdAt: "createDate", updatedAt: "updatedDate" }, minimize: false }
);

MemorySchema.index(
  { signalId: 1, bucketName: 1, memoryId: 1 },
  { unique: true }
);

MemorySchema.index({ signalId: 1, bucketName: 1, removed: 1 });

const MemoryModel = mongoose.model<MemoryDocument>("memory-items", MemorySchema);

export { MemoryModel, IMemoryDto, IMemoryRow };
