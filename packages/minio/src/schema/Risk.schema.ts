import { EntitySchema } from "typeorm";
import { RiskData } from "backtest-kit";
import { epochTransformer } from "../utils/epochTransformer";

interface IRiskDto {
  riskName: string;
  exchangeName: string;
  positions: RiskData;
  when: number;
}

interface IRiskRow extends IRiskDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

const RiskModel = new EntitySchema<IRiskRow>({
  name: "risk-items",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    riskName: { type: String },
    exchangeName: { type: String },
    positions: { type: "jsonb" },
    when: { type: "bigint", transformer: epochTransformer },
    createDate: { type: "timestamptz", createDate: true },
    updatedDate: { type: "timestamptz", updateDate: true },
  },
  indices: [
    {
      name: "risk_items_uq",
      columns: ["riskName", "exchangeName"],
      unique: true,
    },
  ],
});

export { RiskModel, IRiskDto, IRiskRow };
