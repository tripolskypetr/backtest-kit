import { EntitySchema } from "typeorm";
import { MemoryData } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface IMemoryDto {
  signalId: string;
  bucketName: string;
  memoryId: string;
  payload: MemoryData;
  removed: boolean;
  when: number;
}

interface IMemoryRow extends IMemoryDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const MemoryModel = new EntitySchema<IMemoryRow>({
  name: "memory-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    signalId: { type: String },
    bucketName: { type: String },
    memoryId: { type: String },
    payload: { type: "jsonb" },
    removed: { type: "boolean", default: false },
    when: { type: "bigint", transformer: epochTransformer },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "memory_items_uq",
      columns: ["signalId", "bucketName", "memoryId"],
      unique: true,
    },
    {
      name: "memory_items_signal_bucket_removed_idx",
      columns: ["signalId", "bucketName", "removed"],
    },
  ],
});

export { MemoryModel, IMemoryDto, IMemoryRow };
