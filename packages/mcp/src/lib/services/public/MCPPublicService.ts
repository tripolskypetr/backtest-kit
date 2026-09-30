import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { listMCPSchema } from "tradeforge";
import { getConfig } from "../../../config/params";
import MCPPrivateService from "../private/MCPPrivateService";

export class MCPPublicService {
    private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
    private readonly mcpPrivateService = inject<MCPPrivateService>(TYPES.mcpPrivateService);

    public getStatus = async () => {
        this.loggerService.log("mcpPublicService getStatus");
        const GLOBAL_CONFIG = getConfig();
        const mcpList = await listMCPSchema();
        if (!mcpList.length) {
            throw new Error(`MCP Error: agent control is not configured`);
        }
        const [{ mcpName: fallback }] = mcpList;
        const mcpName = GLOBAL_CONFIG.CC_MCP_NAME || fallback;
        return await this.mcpPrivateService.getStatus(mcpName);
    };

    public commitPositionOpen = async (dto: { symbol: string; position: "long" | "short"; note: string }) => {
        this.loggerService.log("mcpPublicService commitPositionOpen", {
            dto,
        });
        const GLOBAL_CONFIG = getConfig();
        const mcpList = await listMCPSchema();
        if (!mcpList.length) {
            throw new Error(`MCP Error: agent control is not configured`);
        }
        const [{ mcpName: fallback }] = mcpList;
        const mcpName = GLOBAL_CONFIG.CC_MCP_NAME || fallback;
        if (dto.position !== "short" && dto.position !== "long") {
            throw new Error(`MCP Error: invalid value for position argument. Only "short" or "long" allowed`);
        }
        if (!dto.note) {
            throw new Error(`MCP Error: note is required`);
        }
        if (!dto.symbol) {
            throw new Error(`MCP Error: symbol is required`);
        }
        return await this.mcpPrivateService.commitPositionOpen({
            mcpName,
            note: dto.note,
            symbol: dto.symbol,
            position: dto.position,
        });
    };

    public commitPositionClose = async (dto: { symbol: string; note: string; }) => {
        this.loggerService.log("mcpPublicService commitPositionClose", {
            dto,
        });
        const GLOBAL_CONFIG = getConfig();
        const mcpList = await listMCPSchema();
        if (!mcpList.length) {
            throw new Error(`MCP Error: agent control is not configured`);
        }
        const [{ mcpName: fallback }] = mcpList;
        const mcpName = GLOBAL_CONFIG.CC_MCP_NAME || fallback;
        if (!dto.note) {
            throw new Error(`MCP Error: note is required`);
        }
        if (!dto.symbol) {
            throw new Error(`MCP Error: symbol is required`);
        }
        return await this.mcpPrivateService.commitPositionClose({
            mcpName,
            note: dto.note,
            symbol: dto.symbol,
        });
    };

    public commitAverageBuy = async (dto: { symbol: string }) => {
        this.loggerService.log("mcpPublicService commitAverageBuy", {
            dto,
        });
        const GLOBAL_CONFIG = getConfig();
        const mcpList = await listMCPSchema();
        if (!mcpList.length) {
            throw new Error(`MCP Error: agent control is not configured`);
        }
        const [{ mcpName: fallback }] = mcpList;
        const mcpName = GLOBAL_CONFIG.CC_MCP_NAME || fallback;
        if (!dto.symbol) {
            throw new Error(`MCP Error: symbol is required`);
        }
        return await this.mcpPrivateService.commitAverageBuy({
            mcpName,
            symbol: dto.symbol,
        });
    };

    public commitSignalNotify = async (dto: { symbol: string; note: string }) => {
        this.loggerService.log("mcpPublicService commitSignalNotify", {
            dto,
        });
        const GLOBAL_CONFIG = getConfig();
        const mcpList = await listMCPSchema();
        if (!mcpList.length) {
            throw new Error(`MCP Error: agent control is not configured`);
        }
        const [{ mcpName: fallback }] = mcpList;
        const mcpName = GLOBAL_CONFIG.CC_MCP_NAME || fallback;
        if (!dto.note) {
            throw new Error(`MCP Error: note is required`);
        }
        if (!dto.symbol) {
            throw new Error(`MCP Error: symbol is required`);
        }
        return await this.mcpPrivateService.commitSignalNotify({
            mcpName,
            symbol: dto.symbol,
            note: dto.note,
        });
    };
}

export default MCPPublicService;
