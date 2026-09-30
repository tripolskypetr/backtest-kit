import { RiskData } from "tradeforge";

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

export { IRiskDto, IRiskRow };
