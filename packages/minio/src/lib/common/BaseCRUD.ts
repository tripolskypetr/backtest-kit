import { factory } from "di-factory";
import { EntitySchema, Repository, FindOptionsOrder, FindOptionsWhere } from "typeorm";
import { inject } from "../core/di";
import LoggerService from "../services/base/LoggerService";
import TYPES from "../core/types";
import { getPostgres } from "../../config/postgres";

const FIND_ALL_LIMIT = 1_000;

export const BaseCRUD = factory(
  class {
    readonly loggerService = inject<LoggerService>(TYPES.loggerService);

    constructor(public readonly TargetModel: EntitySchema<any>) {}

    public get entityName(): string {
      return this.TargetModel.options.name;
    }

    public async repo<T = any>(): Promise<Repository<T>> {
      const dataSource = await getPostgres();
      return dataSource.getRepository<T>(this.TargetModel);
    }

    public async create(dto: object) {
      this.loggerService.info(`BaseCRUD create entityName=${this.entityName}`, {
        dto,
      });
      const repo = await this.repo();
      const entity = repo.create(dto as any);
      const saved = await repo.save(entity);
      return saved as any;
    }

    public async update(id: string, dto: object) {
      this.loggerService.info(`BaseCRUD update entityName=${this.entityName}`, {
        id,
        dto,
      });
      const repo = await this.repo();
      const { id: _omitId, ...rest } = dto as Record<string, unknown>;
      await repo.update({ id } as any, rest as any);
      const updated = await repo.findOne({ where: { id } as any });
      if (!updated) {
        throw new Error(`${this.entityName} not found`);
      }
      return updated as any;
    }

    public async findById(id: string) {
      this.loggerService.info(`BaseCRUD findById entityName=${this.entityName}`, {
        id,
      });
      const repo = await this.repo();
      const item = await repo.findOne({ where: { id } as any });
      if (!item) {
        throw new Error(`${this.entityName} not found`);
      }
      return item as any;
    }

    public async findByFilter(filterData: object, order?: object) {
      this.loggerService.info(`BaseCRUD findByFilter entityName=${this.entityName}`, {
        filterData,
        order,
      });
      const repo = await this.repo();
      const item = await repo.findOne({
        where: filterData as FindOptionsWhere<any>,
        order: order as FindOptionsOrder<any>,
      });
      return (item as any) ?? null;
    }

    public async findAll(filterData: object = {}, limit = FIND_ALL_LIMIT, order?: object) {
      this.loggerService.info(`BaseCRUD findAll entityName=${this.entityName}`, {
        filterData,
      });
      const repo = await this.repo();
      const items = await repo.find({
        where: filterData as FindOptionsWhere<any>,
        order: order as FindOptionsOrder<any>,
        take: limit,
      });
      return items as any[];
    }
  }
);

export default BaseCRUD;
