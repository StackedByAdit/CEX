import { prisma } from "../prisma";
import { BALANCES, STOCK_BY_SYMBOL, type BalanceRecord } from "../state";
import { getAssetScale, parseUnits } from "./precision";

export function getBalance(userId: string, symbol: string): BalanceRecord {
    let balance = BALANCES[userId]?.[symbol];
    if (!balance) {
        if (!BALANCES[userId]) BALANCES[userId] = {};
        balance = {
            available: 0n,
            locked: 0n,
            balanceId: "",
        };
        BALANCES[userId]![symbol] = balance;
    }
    return balance;
}

export async function assureBalance(userId: string, symbol: string): Promise<BalanceRecord> {
    if (!BALANCES[userId]) BALANCES[userId] = {};

    if (BALANCES[userId]![symbol]) {
        return BALANCES[userId]![symbol]!;
    }

    const scale = getAssetScale(symbol);

    if (symbol === "INR") {
        let balance = await prisma.balance.findFirst({
            where: { userId, assetType: "INR" }
        });

        if (!balance) {
            try {
                balance = await prisma.balance.create({
                    data: { userId, stockId: null, assetType: "INR", available: 0, locked: 0 }
                });
            } catch {
                balance = await prisma.balance.findFirst({
                    where: { userId, assetType: "INR" }
                });
            }
        }

        if (!balance) {
            throw new Error(`Failed to assure INR balance for user ${userId}`);
        }

        if (!BALANCES[userId]![symbol]) {
            BALANCES[userId]![symbol] = {
                available: parseUnits(balance.available.toString(), scale.decimals),
                locked: parseUnits(balance.locked.toString(), scale.decimals),
                balanceId: balance.id
            };
        }

        return BALANCES[userId]![symbol]!;
    }

    const stockMeta = STOCK_BY_SYMBOL[symbol];
    if (!stockMeta) throw new Error(`Stock not found: ${symbol}`);

    let balance = await prisma.balance.findFirst({
        where: { userId, assetType: "STOCK", stockId: stockMeta.id }
    });

    if (!balance) {
        try {
            balance = await prisma.balance.create({
                data: { userId, stockId: stockMeta.id, assetType: "STOCK", available: 0, locked: 0 }
            });
        } catch {
            balance = await prisma.balance.findFirst({
                where: { userId, assetType: "STOCK", stockId: stockMeta.id }
            });
        }
    }

    if (!balance) {
        throw new Error(`Failed to assure ${symbol} balance for user ${userId}`);
    }

    if (!BALANCES[userId]![symbol]) {
        BALANCES[userId]![symbol] = {
            available: parseUnits(balance.available.toString(), scale.decimals),
            locked: parseUnits(balance.locked.toString(), scale.decimals),
            balanceId: balance.id
        };
    }

    return BALANCES[userId]![symbol]!;
}
