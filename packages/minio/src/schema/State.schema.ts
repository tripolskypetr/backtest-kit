import { StateData } from "tradeforge";

interface IStateDto {
  signalId: string;
  bucketName: string;
  payload: StateData;
  when: number;
}

interface IStateRow extends IStateDto {
  id: string;
  createDate: Date;
  updatedDate: Date;
}

export { IStateDto, IStateRow };
