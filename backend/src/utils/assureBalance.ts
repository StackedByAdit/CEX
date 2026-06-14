import { prisma } from "../prisma";
import { BALANCES, STOCK_BY_SYMBOL } from "../state";

export async function assureBalance(userId: string, symbol: string) {
    if (!BALANCES[userId]) BALANCES[userId] = {};

    if (BALANCES[userId]![symbol]) {
        return BALANCES[userId]![symbol]!;
    }

    if (symbol === "INR") {
        let balance = await prisma.balance.findFirst({
            where: { userId, assetType: "INR" }
        });

        if (!balance) {
            balance = await prisma.balance.create({
                data: { userId, stockId: null, assetType: "INR", available: 0, locked: 0 }
            });
        }

        BALANCES[userId]![symbol] = {
            available: balance.available.toNumber(),
            locked: balance.locked.toNumber(),
            balanceId: balance.id
        };

        return BALANCES[userId]![symbol]!;
    }

    const stockMeta = STOCK_BY_SYMBOL[symbol];
    if (!stockMeta) throw new Error(`Stock not found: ${symbol}`);

    let balance = await prisma.balance.findFirst({
        where: { userId, assetType: "STOCK", stockId: stockMeta.id }
    });

    if (!balance) {
        balance = await prisma.balance.create({
            data: { userId, stockId: stockMeta.id, assetType: "STOCK", available: 0, locked: 0 }
        });
    }

    BALANCES[userId]![symbol] = {
        available: balance.available.toNumber(),
        locked: balance.locked.toNumber(),
        balanceId: balance.id
    };

    return BALANCES[userId]![symbol]!;
}