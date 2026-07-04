import { factory } from "di-factory";
import { Model } from "mongoose";
import { readTransform } from "../../utils/readTransform";
import { inject } from "../core/di";
import LoggerService from "../services/base/LoggerService";
import TYPES from "../core/types";
import { omit } from "../../utils/omit";

const FIND_ALL_LIMIT = 1_000;

export const BaseCRUD = factory(
  class {
    readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    constructor(public readonly TargetModel: Model<any>) {}

    public async create(dto: object) {
      this.loggerService.info(`BaseCRUD create modelName=${this.TargetModel.modelName}`, {
        dto,
      });
      const item = await this.TargetModel.create(dto);
      return readTransform(item.toJSON());
    }

    public async update(id: string, dto: object) {
      this.loggerService.info(`BaseCRUD update modelName=${this.TargetModel.modelName}`, {
        id,
        dto,
      });
      const updatedDocument = await this.TargetModel.findByIdAndUpdate(
        id,
        omit(dto, <any>["id"]),
        {
          new: true,
          runValidators: true,
        }
      );
      if (!updatedDocument) {
        throw new Error(`${this.TargetModel.modelName} not found`);
      }
      return readTransform(updatedDocument.toJSON());
    }

    public async findById(id: string) {
      this.loggerService.info(`BaseCRUD findById modelName=${this.TargetModel.modelName}`, {
        id,
      });
      const item = await this.TargetModel.findById(id);
      if (!item) {
        throw new Error(`${this.TargetModel.modelName} not found`);
      }
      return readTransform(item.toJSON());
    }

    public async findByFilter(filterData: object, sort?: object) {
      this.loggerService.info(`BaseCRUD findByFilter modelName=${this.TargetModel.modelName}`, {
        filterData,
        sort,
      });
      const item = await this.TargetModel.findOne(filterData, null, {
        sort,
      });
      if (item) {
        return readTransform(item.toJSON());
      }
      return null;
    }

    public async findAll(filterData: object = {}, limit = FIND_ALL_LIMIT) {
      this.loggerService.info(`BaseCRUD findAll modelName=${this.TargetModel.modelName}`, {
        filterData,
      });
      // All schemas rename mongoose timestamps to createDate/updatedDate.
      // Sorting by updatedDate keeps the records the CURRENT backtest/live
      // session is actively writing inside the FIND_ALL_LIMIT window: live
      // rows are upserted constantly and always carry the freshest
      // updatedDate, while rows from finished runs age out of the window.
      const documents = await this.TargetModel.find(filterData)
        .sort({ updatedDate: -1 })
        .limit(limit);
      return documents.map((doc) => readTransform(doc.toJSON()));
    }

    public async *iterate(filterData: object = {}, sort?: object) {
      this.loggerService.info(`BaseCRUD iterate modelName=${this.TargetModel.modelName}`, {
        filterData,
        sort,
      });
      for await (const document of this.TargetModel.find(filterData, null, {
        sort,
      })) {
        yield readTransform(document.toJSON());
      }
    }

    public async paginate(
      filterData: object,
      pagination: {
        limit: number;
        offset: number;
      },
      sort?: object
    ) {
      this.loggerService.info(`BaseCRUD paginate modelName=${this.TargetModel.modelName}`, {
        filterData,
        pagination,
        sort,
      });
      const itemsRaw = await this.TargetModel.find(filterData, null, {
        sort,
      })
        .skip(pagination.offset)
        .limit(pagination.limit);
      const items = itemsRaw.map((item) => item.toJSON());
      const total = await this.TargetModel.countDocuments(filterData);
      return {
        rows: items.map(readTransform),
        total: total,
      };
    }
  }
);

export default BaseCRUD;
